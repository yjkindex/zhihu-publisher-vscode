import { HarReplayer } from "../utils/har-replayer";
import vscode from "vscode";
export async function publishArticle(
  articleId: string,
  cookie: string
): Promise<boolean> {
  const replayer = new HarReplayer();

  const pubtimestamp: string = Date.now().toString();
  const traceId = `${pubtimestamp},${Math.random()
    .toString(36)
    .substring(2, 15)}`;
  replayer.init(vscode.extensions.getExtension("jack-base.zhihu-publisher-vscode")!.extensionPath+"/resource/publishArticle.har");
  replayer.modifyRequest(0, {
    url: "https://www.zhihu.com/api/v4/content/publish",
    headers: {
      cookie: cookie,
    },

    method: "POST",

    postData: {
      mimeType: "application/json",
      text: JSON.stringify({
        action: "article",
        data: {

          publish: { traceId: traceId },
          extra_info: {
            publisher: "pc",
            pc_business_params:
              '{"commentPermission":"anyone","disclaimer_type":"none","disclaimer_status":"close","table_of_contents_enabled":false,"commercial_report_info":{"commercial_types":[]},"commercial_zhitask_bind_info":null,"canReward":false}',
          },
          draft: { disabled: 1, id: articleId, isPublished: false },
          commentsPermission: { comment_permission: "anyone" },
          creationStatement: {
            disclaimer_type: "none",
            disclaimer_status: "close",
          },
          contentsTables: { table_of_contents_enabled: false },
          commercialReportInfo: { isReport: 0 },
          appreciate: { can_reward: false, tagline: "" },
          hybridInfo: {},
        },
      }),
    },
  });
  const result = await replayer.replayRequestByIndex(0)
  // replayer.saveReplayResults("./resource/replay-result.har");
  return result.replayedResponse?.data.code === 0;
}