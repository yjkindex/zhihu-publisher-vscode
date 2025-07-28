A simple example:

```typescript
import HarReplayTool from './HarReplayTool';

async function main() {
  try {
    // 创建 HAR 重播工具实例
    const harReplay = new HarReplayTool();
    
    // 初始化并加载 HAR 文件
    await harReplay.init('resource\\www.zhihu.com_api_v4_me_Archive [25-07-01 17-52-58].new.har\\www.zhihu.com_api_v4_me_Archive [25-07-01 17-52-58]_replayed.har');
    
    // 使用综合方法修改请求
    harReplay.modifyRequest(0, {
      method: 'POST',
      url: 'https://example.com/api/new-endpoint',
      httpVersion: 'HTTP/2',
      headers: {
        'User-Agent': 'Custom User Agent',
        'Authorization': 'Bearer new-token-value'
      },
      cookies: {
        "session_id":  'new-session-value'
        },
      queryString: {
        page: '2',
        limit: '100'
      },
      postData: {
        mimeType: 'application/json',
        text: { username: 'testuser', role: 'admin' },
        params: {
          file: {
            name: 'file',
            value: 'file-content',
            fileName: 'document.txt',
            contentType: 'text/plain'
          }
        }},
      headersSize: 512,
      bodySize: 256,
      comment: 'This request has been modified for testing'
    });
    
    // 执行其他操作...
    await harReplay.replayAllRequests();

    harReplay.saveReplayResults('output.json');
    // 等...
    
  } catch (error) {
    console.error('执行过程中出错:', error);
  }
}

// 执行主函数
main();    ```