import axios, { AxiosRequestConfig } from 'axios';

/**
 * 下载网络图片并返回Buffer对象
 * @param url 图片的HTTP/HTTPS URL
 * @param timeout 超时时间（毫秒），默认30秒
 * @returns 图片的Buffer数据
 * @throws 当下载失败、响应无效或内容不是图片时抛出错误
 */
export async function downloadImage(
  url: string,
  timeout: number = 30000
): Promise<Buffer> {
  try {
    // 验证URL格式
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`无效的图片URL: ${url}`);
    }

    // 配置请求
    const config: AxiosRequestConfig = {
      method: 'get',
      url,
      responseType: 'arraybuffer', // 重要：指定响应类型为二进制数组
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      },
      // 跟随重定向
      maxRedirects: 5
    };

    // 发送请求
    const response = await axios(config);

    // 验证响应状态
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`下载图片失败，HTTP状态码: ${response.status}`);
    }

    // 验证响应内容类型
    const contentType = response.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) {
      throw new Error(`URL返回的不是图片类型，实际类型: ${contentType}`);
    }

    // 将arraybuffer转换为Buffer并返回
    return Buffer.from(response.data);

  } catch (error) {
    console.error(`下载图片失败 (${url}):`, error);
    throw new Error(`下载图片失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
    