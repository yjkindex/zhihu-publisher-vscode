import { HarReplayer } from "../utils/har-replayer";
import vscode from "vscode";
async function updateArticle(
  articleId: string,
  title: string,
  content: string,
  cookie: string
): Promise<boolean> {
  const body = {
    title: title,
    content: content,
    table_of_contents: false,
    delta_time: 9,
    can_reward: false,
  };
  const replayer = new HarReplayer();
  replayer.init(vscode.extensions.getExtension("jack-base.zhihu-publisher-vscode")!.extensionPath + "/resource/draft.har");
  replayer.modifyRequest(0, {
    url: `https://zhuanlan.zhihu.com/api/articles/${articleId}/draft`,
    headers: {
      Cookie: cookie,
    },
    postData: {
      mimeType: "application/json",
      params: {},
      text: body,
    },
    method: "PATCH",
  });
  const result = replayer.replayRequestByIndex(0);
  return (await result).replayedResponse?.status === 200;
}

async function createArticle(cookie: string): Promise<string | void> {
  const body = {
    title: "1",
    delta_time: 0,
    can_reward: false,
  };
  let replayer = new HarReplayer();
  replayer.init(vscode.extensions.getExtension("jack-base.zhihu-publisher-vscode")!.extensionPath+"/resource/draft.har");
  replayer.modifyRequest(0, {
    headers: {
      Cookie: cookie,
    },
    method: "POST",
  });
  const result = replayer.replayRequestByIndex(0);
  return (await result).replayedResponse?.data.id || void 0;
}
async function deleteArticle(
  articleId: string,
  cookie: string
): Promise<boolean> {
  const replayer = new HarReplayer();
  replayer.init(vscode.extensions.getExtension("jack-base.zhihu-publisher-vscode")!.extensionPath+"/resource/draft.har");
  replayer.modifyRequest(0, {
    url: `https://www.zhihu.com/api/articles/${articleId}/draft`,
    headers: {
      Cookie: cookie,
    },
    method: "DELETE",
  });

  const result = replayer.replayRequestByIndex(0);
  return (await result).replayedResponse?.status === 200;
}

export { deleteArticle, createArticle, updateArticle };
