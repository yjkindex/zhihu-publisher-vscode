import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import vscode from "vscode";
export async function uploadMarkdownFile(
  fileContent: string,
  cookie: string,
  resourceMap:any
): Promise<string> {
  try {

    if (typeof fileContent !== "string") {
      vscode.window.showErrorMessage("A problem occurred while processing the markdown file.");
    }

    // 创建 FormData 对象
    const formData = new FormData();
    formData.append("document", fileContent, { filename: "test.md" });

    // 配置请求参数
    const axiosConfig = {
      method: "post",
      url: "https://www.zhihu.com/api/v4/document_convert",
      data: formData,
      headers: {
        host: "www.zhihu.com",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
        accept: "*/*",
        "accept-language":
          "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
        "accept-encoding": "gzip, deflate, br, zstd",
        "x-requested-with": "fetch",
        origin: "https://zhuanlan.zhihu.com",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        priority: "u=4",
        te: "trailers",
        cookie: cookie,
      },
      maxContentLength: Infinity, // 允许处理大文件
      maxBodyLength: Infinity, // 允许处理大请求体
    };

    // 合并 FormData 自动生成的请求头（如 boundary）
    Object.assign(axiosConfig.headers, formData.getHeaders());

    // 创建 axios 实例
    const axiosInstance = axios.create();

    // 发送请求
    const response = await axiosInstance.request(axiosConfig);

    console.log("上传成功:", response.data);
    return response.data.html;
  } catch (error: any) {
    console.error("上传失败:", error.message);
    if (error.response) {
      console.error("状态码:", error.response.status);
      console.error("响应数据:", error.response.data);
    }
    throw error;
  }
}
