import * as vscode from "vscode";
import { zhihuPublisher } from "./provider/zhihuPublisher";

export function activate(context: vscode.ExtensionContext) {
  let disposable = [
    vscode.commands.registerCommand(
      "zhihu-publisher-vscode.zhihuPublisher",
      zhihuPublisher
    )
  ];
  context.subscriptions.push(...disposable);
}

export function deactivate() {}
