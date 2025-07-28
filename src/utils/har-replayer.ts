import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from "axios";
import * as fs from "fs";
import * as path from "path";
import * as https from "https"; // 新增HTTPS模块支持

// HAR 文件结构定义
interface HAR {
  log: {
    version: string;
    creator: { name: string; version: string };
    pages: any[];
    entries: HAREntry[];
  };
}

interface HAREntry {
  startedDateTime: string;
  time: number;
  request: HARRequest;
  response: HARResponse;
  cache: any;
  timings: {
    blocked: number;
    dns: number;
    connect: number;
    send: number;
    wait: number;
    receive: number;
    ssl?: number;
  };
  serverIPAddress?: string;
  connection?: string;
  pageref?: string;
}

interface HARRequest {
  method: string;
  url: string;
  httpVersion: string;
  cookies: Array<{
    name: string;
    value: string;
    path?: string;
    domain?: string;
    expires?: string;
    httpOnly: boolean;
    secure: boolean;
  }>;
  headers: Array<{ name: string; value: string }>;
  queryString: Array<{ name: string; value: string }>;
  postData?: {
    mimeType: string;
    text: string;
    params?: Array<{
      name: string;
      value?: string;
      fileName?: string;
      contentType?: string;
    }>;
  };
  headersSize: number;
  bodySize: number;
  comment?: string;
}

interface HARResponse {
  status: number;
  statusText: string;
  httpVersion: string;
  cookies: Array<{
    name: string;
    value: string;
    path?: string;
    domain?: string;
    expires?: string;
    httpOnly: boolean;
    secure: boolean;
  }>;
  headers: Array<{ name: string; value: string }>;
  content: {
    size: number;
    compression?: number;
    mimeType: string;
    text: string;
    encoding?: string;
  };
  redirectURL: string;
  headersSize: number;
  bodySize: number;
  comment?: string;
}

// 其他接口定义保持不变...
interface HarCookie {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  expires?: string;
  httpOnly: boolean;
  secure: boolean;
  comment?: string;
}

interface HarHeader {
  name: string;
  value: string;
  comment?: string;
}

interface HarQueryParam {
  name: string;
  value: string;
  comment?: string;
}

interface HarPostData {
  mimeType: string;
  params?: HarPostParam[];
  text?: string;
  comment?: string;
}

interface HarPostParam {
  name: string;
  value?: string;
  fileName?: string;
  contentType?: string;
  comment?: string;
}

interface HarContent {
  size: number;
  compression?: number;
  mimeType: string;
  text?: string;
  encoding?: string;
  comment?: string;
}

// 重播结果结构
interface ReplayResult {
  index: number;
  request: HARRequest;
  originalResponse: HARResponse;
  replayedResponse?: AxiosResponse;
  error?: any;
  match?: boolean;
  timeTaken?: number;
}

interface RequestModificationConfig {
  method?: string;
  url?: string;
  httpVersion?: string;
  headers?: { [name: string]: string };
  cookies?: { [name: string]: string };
  queryString?: { [name: string]: string };
  postData?: {
    mimeType?: string;
    text?: string | object;
    params?: { [name: string]: string | HarPostParam };
  };
  headersSize?: number;
  bodySize?: number;
  comment?: string;
}

// 回调函数类型
type RequestStartCallback = (index: number, request: HARRequest) => void;
type RequestCompleteCallback = (
  index: number,
  request: HARRequest,
  response: AxiosResponse,
  result: ReplayResult
) => void;
type ErrorCallback = (
  index: number,
  request: HARRequest,
  error: any,
  result: ReplayResult
) => void;

class HarReplayer {
  private harData: HAR | null = null;
  private axiosInstance: AxiosInstance;
  private delayMs: number = 0;
  private maintainSession: boolean = false;
  private concurrencyLevel: number = 1;
  private replayResults: ReplayResult[] = [];
  private proxyConfig?: { host: string; port: number; protocol?: string };
  // 回调函数
  private onRequestStartCallbacks: RequestStartCallback[] = [];
  private onRequestCompleteCallbacks: RequestCompleteCallback[] = [];
  private onErrorCallbacks: ErrorCallback[] = [];

  constructor() {
    // 初始化 Axios 实例，增加HTTPS配置
    this.axiosInstance = axios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized: true, // 默认验证证书
      }),
    });
  }

  // 基础功能方法 - 初始化与配置
  public init(harFilePath: string): void {
    try {
      const data = fs.readFileSync(harFilePath, "utf8");
      this.harData = JSON.parse(data) as HAR;
    } catch (error) {
      throw error;
    }
  }

  // 改进代理设置，支持HTTP和HTTPS代理
  public setProxy(proxyConfig: {
    host: string;
    port: number;
    protocol?: string;
  }): void {
    this.proxyConfig = proxyConfig;
    this.axiosInstance.defaults.proxy = false; // 禁用axios默认代理
  }

  // 新增: 设置是否忽略SSL证书验证
  public setIgnoreSSL(ignore: boolean): void {
    this.axiosInstance.defaults.httpsAgent = new https.Agent({
      rejectUnauthorized: !ignore,
    });
  }

  public setDelay(delayMs: number): void {
    this.delayMs = delayMs;
  }

  // 请求处理
  public async replayAllRequests(): Promise<ReplayResult[]> {
    if (!this.harData) {
      throw new Error("HAR 文件未加载，请先调用 init 方法");
    }
    this.replayResults = [];

    if (this.concurrencyLevel > 1) {
      return this.runConcurrentReplay(
        this.harData.log.entries.map((_, index) => index)
      );
    }

    for (let i = 0; i < this.harData.log.entries.length; i++) {
      await this.replayRequestByIndex(i);

      // 应用请求间延迟
      if (this.delayMs > 0 && i < this.harData.log.entries.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      }
    }

    return this.replayResults;
  }

  public async replayRequestByIndex(index: number): Promise<ReplayResult> {
    if (!this.harData) {
      throw new Error("HAR 文件未加载，请先调用 init 方法");
    }

    if (index < 0 || index >= this.harData.log.entries.length) {
      throw new Error(
        `索引 ${index} 超出范围，有效范围是 0 到 ${
          this.harData.log.entries.length - 1
        }`
      );
    }

    const entry = this.harData.log.entries[index];
    const result: ReplayResult = {
      index,
      request: entry.request,
      originalResponse: entry.response,
    };

    // 触发请求开始回调
    this.onRequestStartCallbacks.forEach((callback) =>
      callback(index, entry.request)
    );

    const startTime = Date.now();

    try {
      const axiosConfig = this.prepareAxiosConfig(entry.request);
      const response = await this.axiosInstance.request(axiosConfig);
      console.log(
        `请求 #${index + 1}: ${entry.request.method} ${
          entry.request.url
        } - 状态码: ${response.status}`
      );
      result.replayedResponse = response;
      result.timeTaken = Date.now() - startTime;
      result.match = this.validateResponse(response, entry.response);

      // 触发请求完成回调
      this.onRequestCompleteCallbacks.forEach((callback) =>
        callback(index, entry.request, response, result)
      );
    } catch (error: any) {
      result.error = error;
      result.timeTaken = Date.now() - startTime;
      console.error(
        `请求 #${index + 1} 失败: ${entry.request.method} ${
          entry.request.url
        } - 状态码: ${error.response.status}`
      );

      this.onErrorCallbacks.forEach((callback) => {
        callback(index, entry.request, error, result);
      });
    }

    this.replayResults[index] = result;
    return result;
  }

  public async replayRequestsByFilter(
    filterFunc: (request: HARRequest, index: number) => boolean
  ): Promise<ReplayResult[]> {
    if (!this.harData) {
      throw new Error("HAR 文件未加载，请先调用 init 方法");
    }

    const filteredIndices = this.harData.log.entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry, index }) => filterFunc(entry.request, index))
      .map(({ index }) => index);

    if (this.concurrencyLevel > 1) {
      return this.runConcurrentReplay(filteredIndices);
    }

    const results: ReplayResult[] = [];

    for (const index of filteredIndices) {
      const result = await this.replayRequestByIndex(index);
      results.push(result);

      // 应用请求间延迟
      if (
        this.delayMs > 0 &&
        index !== filteredIndices[filteredIndices.length - 1]
      ) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      }
    }

    return results;
  }

  // 响应验证
  public validateResponse(
    response: AxiosResponse,
    expected: HARResponse
  ): boolean {
    // 验证状态码
    const statusMatch = response.status === expected.status;

    // 验证内容类型
    const responseContentType = response.headers["content-type"] || "";
    const expectedContentType = expected.content.mimeType || "";
    const contentTypeMatch = responseContentType.includes(
      expectedContentType.split(";")[0]
    );

    // 简单验证响应体
    let bodyMatch = true;
    if (expected.content.text) {
      try {
        // 尝试解析为 JSON
        const expectedJson = JSON.parse(expected.content.text);
        const responseJson =
          typeof response.data === "object"
            ? response.data
            : JSON.parse(response.data);
        bodyMatch =
          JSON.stringify(expectedJson) === JSON.stringify(responseJson);
      } catch (e) {
        // 不是 JSON，进行字符串比较
        bodyMatch = response.data.toString().includes(expected.content.text);
      }
    }

    return statusMatch && contentTypeMatch && bodyMatch;
  }

  public compareResponses(
    original: HARResponse,
    replayed: AxiosResponse
  ): { matches: boolean; differences: any[] } {
    const differences = [];

    // 比较状态码
    if (original.status !== replayed.status) {
      differences.push({
        field: "status",
        original: original.status,
        replayed: replayed.status,
      });
    }

    // 比较内容类型
    const originalContentType = original.content.mimeType || "";
    const replayedContentType = replayed.headers["content-type"] || "";
    if (!replayedContentType.includes(originalContentType.split(";")[0])) {
      differences.push({
        field: "content-type",
        original: originalContentType,
        replayed: replayedContentType,
      });
    }

    // 比较响应体
    try {
      const originalJson = original.content.text
        ? JSON.parse(original.content.text)
        : null;
      const replayedJson =
        typeof replayed.data === "object"
          ? replayed.data
          : JSON.parse(replayed.data);

      if (JSON.stringify(originalJson) !== JSON.stringify(replayedJson)) {
        differences.push({
          field: "body",
          original: originalJson,
          replayed: replayedJson,
        });
      }
    } catch (e) {
      // 不是 JSON，进行字符串比较
      const originalText = original.content.text || "";
      const replayedText = replayed.data.toString();

      if (originalText !== replayedText) {
        differences.push({
          field: "body",
          original:
            originalText.substring(0, 100) +
            (originalText.length > 100 ? "..." : ""),
          replayed:
            replayedText.substring(0, 100) +
            (replayedText.length > 100 ? "..." : ""),
          message: "响应体不匹配（非 JSON 内容）",
        });
      }
    }

    return {
      matches: differences.length === 0,
      differences,
    };
  }

  // 请求修改
  public modifyRequest(
    requestId: number,
    config: RequestModificationConfig
  ): boolean {
    if (
      !this.harData ||
      requestId < 0 ||
      requestId >= this.harData.log.entries.length
    ) {
      return false;
    }

    const request = this.harData.log.entries[requestId].request;

    // 修改请求方法
    if (config.method !== undefined) {
      request.method = config.method;
    }

    // 修改请求URL
    if (config.url !== undefined) {
      request.url = config.url;
    }

    // 修改HTTP版本
    if (config.httpVersion !== undefined) {
      request.httpVersion = config.httpVersion;
    }

    // 修改请求头
    if (config.headers !== undefined) {
      Object.entries(config.headers).forEach(([name, value]) => {
        const headerValue = value;

        const headerIndex = request.headers.findIndex(
          (h) => h.name.toLowerCase() === name.toLowerCase()
        );
        if (headerIndex === -1) {
          request.headers.push({ name, value: headerValue });
        } else {
          request.headers[headerIndex].value = headerValue;
        }
      });
    }

    // 修改Cookie
    if (config.cookies !== undefined) {
      Object.entries(config.cookies).forEach(([name, value]) => {
        const cookieData = {
          name: name,
          value: value,
          httpOnly: false,
          secure: false,
        };
        const cookieIndex = request.cookies.findIndex(
          (c) => c.name.toLowerCase() === name.toLowerCase()
        );
        if (cookieIndex !== -1) {
          request.cookies[cookieIndex] = cookieData;
        } else {
          request.cookies.push(cookieData);
        }
      });
    }

    // 修改查询参数
    if (config.queryString !== undefined) {
      Object.entries(config.queryString).forEach(([name, value]) => {
        const paramIndex = request.queryString.findIndex(
          (p) => p.name.toLowerCase() === name.toLowerCase()
        );

        if (paramIndex !== -1) {
          request.queryString[paramIndex].value = value;
        } else {
          request.queryString.push({ name, value });
        }
      });
    }

    // 修改请求体
    if (config.postData !== undefined) {
      // 如果原请求没有 body，添加一个
      if (!request.postData) {
        request.postData = {
          mimeType: "application/json",
          text: "",
        };
      }

      // 修改MIME类型
      if (config.postData.mimeType !== undefined) {
        request.postData.mimeType = config.postData.mimeType;
      }

      // 修改请求体文本
      if (config.postData.text !== undefined) {
        request.postData.text =
          typeof config.postData.text === "string"
            ? config.postData.text
            : JSON.stringify(config.postData.text);
      }

      // 修改表单参数
      if (config.postData.params !== undefined) {
        if (!request.postData.params) {
          request.postData.params = [];
        }

        Object.entries(config.postData.params).forEach(([name, param]) => {
          const paramData =
            typeof param === "string"
              ? { name: name, value: param }
              : { ...param, name: name };

          const paramIndex = request.postData!.params!.findIndex(
            (p) => p.name.toLowerCase() === name.toLowerCase()
          );

          if (paramIndex !== -1) {
            request.postData!.params![paramIndex] = paramData;
          } else {
            request.postData!.params!.push(paramData);
          }
        });
      }
    }

    // 修改头大小
    if (config.headersSize !== undefined) {
      request.headersSize = config.headersSize;
    }

    // 修改体大小
    if (config.bodySize !== undefined) {
      request.bodySize = config.bodySize;
    }

    // 修改注释
    if (config.comment !== undefined) {
      request.comment = config.comment;
    }

    return true;
  }

  // 并发与性能
  public setConcurrency(concurrencyLevel: number): void {
    this.concurrencyLevel = Math.max(1, concurrencyLevel);
  }

  public async runConcurrentReplay(
    requestIndices: number[]
  ): Promise<ReplayResult[]> {
    if (!this.harData) {
      throw new Error("HAR 文件未加载，请先调用 init 方法");
    }

    const results: ReplayResult[] = [];
    let currentIndex = 0;

    const worker = async (): Promise<void> => {
      while (currentIndex < requestIndices.length) {
        const index = requestIndices[currentIndex++];
        try {
          const result = await this.replayRequestByIndex(index);
          results.push(result);
        } catch (error) {}

        // 应用请求间延迟
        if (this.delayMs > 0 && currentIndex < requestIndices.length) {
          await new Promise((resolve) => setTimeout(resolve, this.delayMs));
        }
      }
    };

    // 创建并发工作线程
    const workers = Array.from({ length: this.concurrencyLevel }, () =>
      worker()
    );
    await Promise.all(workers);

    // 确保结果按请求索引排序
    return results.sort((a, b) => a.index - b.index);
  }

  // 结果记录
  public async saveReplayResults(outputPath: string): Promise<void> {
    try {
      const resultsToSave = this.replayResults.map((result) => ({
        index: result.index,
        request: result.request,
        originalResponse: result.originalResponse,
        replayedResponse: result.replayedResponse
          ? {
              status: result.replayedResponse.status,
              headers: result.replayedResponse.headers,
              data: result.replayedResponse.data,
            }
          : undefined,
        error: result.error ? this.serializeError(result.error) : undefined,
        match: result.match,
        timeTaken: result.timeTaken,
      }));

      const outputDir = path.dirname(outputPath);
      await fs.promises.mkdir(outputDir, { recursive: true });
      await fs.promises.writeFile(
        outputPath,
        JSON.stringify(resultsToSave, null, 2)
      );
    } catch (error) {
      throw error;
    }
  }

  public async saveReplayResultsAsHar(outputPath: string): Promise<void> {
    try {
      const resultsToSave: Array<HAREntry> = this.replayResults.map(
        (result) => ({
          startedDateTime: new Date().toISOString(),
          time: result.timeTaken || 0,
          request: result.request,
          response: {
            status: result.replayedResponse?.status || 0,
            statusText: result.replayedResponse?.statusText || "",
            httpVersion: result.request?.httpVersion,
            headers: Object.entries(result.replayedResponse?.headers || {}).map(
              ([name, value]) => ({
                name: name,
                value: value?.toString() || "",
              })
            ),
            cookies: result.request?.cookies,
            bodySize: result.replayedResponse?.data
              ? Buffer.byteLength(result.replayedResponse.data)
              : 0,
            content: {
              size: result.replayedResponse?.data
                ? Buffer.byteLength(result.replayedResponse.data)
                : 0,
              compression: 0,
              mimeType: result.replayedResponse?.headers["content-type"] || "",
              text: result.replayedResponse?.data,
              encoding:
                result.replayedResponse?.headers["content-encoding"] || "",
            },
            redirectURL: "",
            headersSize: result.replayedResponse
              ? Buffer.byteLength(
                  JSON.stringify(result.replayedResponse.headers)
                )
              : 0,
          },
          match: result.match,
          timeTaken: result.timeTaken,
          cache: {},
          index: result.index,
          timings: {
            blocked: 0,
            dns: 0,
            connect: 0,
            send: result.timeTaken || 0,
            wait: result.timeTaken || 0,
            receive: result.timeTaken || 0,
          },
        })
      );
      const harData: HAR = {
        log: {
          creator: {
            name: "HarReplayer",
            version: "1.0.0",
          },
          version: "1.2",
          pages: [],
          entries: resultsToSave,
        },
      };
      const outputDir = path.dirname(outputPath);
      await fs.promises.mkdir(outputDir, { recursive: true });
      await fs.promises.writeFile(outputPath, JSON.stringify(harData, null, 2));
    } catch (error) {
      throw error;
    }
  }

  public generateReport(): string {
    if (!this.replayResults || this.replayResults.length === 0) {
      return "没有可用的重播结果";
    }

    const totalRequests = this.replayResults.length;
    const successfulRequests = this.replayResults.filter(
      (r) => r.match === true
    ).length;
    const failedRequests = this.replayResults.filter(
      (r) => r.match === false || r.error
    ).length;

    let report = `请求重播报告\n`;
    report += `================================\n`;
    report += `总请求数: ${totalRequests}\n`;
    report += `成功匹配: ${successfulRequests} (${(
      (successfulRequests / totalRequests) *
      100
    ).toFixed(2)}%)\n`;
    report += `匹配失败: ${failedRequests} (${(
      (failedRequests / totalRequests) *
      100
    ).toFixed(2)}%)\n`;
    report += `================================\n\n`;

    // 添加详细结果
    this.replayResults.forEach((result, index) => {
      report += `请求 #${index + 1}: ${result.request.method} ${
        result.request.url
      }\n`;

      if (result.error) {
        report += `  ❌ 错误: ${result.error.message || result.error}\n`;
      } else if (result.match === false) {
        report += `  ❌ 响应不匹配\n`;
      } else {
        report += `  ✅ 响应匹配\n`;
      }

      if (result.timeTaken !== undefined) {
        report += `  耗时: ${result.timeTaken}ms\n`;
      }

      report += `--------------------------------\n`;
    });

    return report;
  }

  // 辅助方法 - 工具函数
  public getRequestCount(): number {
    return this.harData?.log.entries.length || 0;
  }

  public getRequestDetails(index: number): HARRequest | null {
    if (
      !this.harData ||
      index < 0 ||
      index >= this.harData.log.entries.length
    ) {
      return null;
    }

    return this.harData.log.entries[index].request;
  }

  public getSupportedMethods(): string[] {
    return ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];
  }

  // 辅助方法 - 事件回调
  public onRequestStart(callback: RequestStartCallback): void {
    this.onRequestStartCallbacks.push(callback);
  }

  public onRequestComplete(callback: RequestCompleteCallback): void {
    this.onRequestCompleteCallbacks.push(callback);
  }

  public onError(callback: ErrorCallback): void {
    this.onErrorCallbacks.push(callback);
  }

  // 私有辅助方法
  private prepareAxiosConfig(request: HARRequest): AxiosRequestConfig {
    // 判断请求协议类型
    const isHttps = request.url.startsWith("https://");
    // 去掉content-length头
    request.headers = request.headers.filter(
      (h) =>
        h.name.toLowerCase() !== "content-length" && !h.name.startsWith(":")
    );
    const config: AxiosRequestConfig = {
      method: request.method as any,
      url: request.url,
      headers: this.convertHeadersToObject(request.headers),
      timeout: 30000,
      proxy: this.proxyConfig ? this.proxyConfig : undefined,
    };

    // 添加请求体
    if (request.postData) {
      // 处理不同类型的请求体
      if (request.postData.mimeType.includes("application/json")) {
        try {
          config.data = JSON.parse(request.postData.text);
        } catch (e) {
          // 如果解析失败，作为原始文本发送
          config.data = request.postData.text;
        }
      } else if (
        request.postData.mimeType.includes("application/x-www-form-urlencoded")
      ) {
        config.data = new URLSearchParams();
        request.postData.params?.forEach((param) => {
          (config.data as URLSearchParams).append(
            param.name,
            param.value ? param.value : ""
          );
        });
      } else {
        // 其他类型作为原始文本发送
        config.data = request.postData.text;
      }
    }

    // 添加查询参数
    if (request.queryString && request.queryString.length > 0) {
      config.params = {};
      request.queryString.forEach((param) => {
        (config.params as any)[param.name] = param.value;
      });
    }

    return config;
  }

  private convertHeadersToObject(
    headers: Array<{ name: string; value: string }>
  ): { [key: string]: string } {
    const result: { [key: string]: string } = {};
    headers.forEach((header) => {
      result[header.name] = header.value;
    });
    return result;
  }

  private serializeError(error: any): any {
    if (error instanceof AxiosError) {
      return {
        message: error.message,
        code: error.code,
        config: error.config
          ? {
              method: error.config.method,
              url: error.config.url,
              headers: error.config.headers,
            }
          : undefined,
        response: error.response
          ? {
              status: error.response.status,
              headers: error.response.headers,
              data: error.response.data,
            }
          : undefined,
      };
    }

    return {
      message: error.message || error.toString(),
      stack: error.stack,
    };
  }
}
export { HarReplayer };
