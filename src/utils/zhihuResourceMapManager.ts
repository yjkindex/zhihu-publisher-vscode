import fs from "fs";
import * as vscode from "vscode";
// 读取文章映射文件
function readZhihuResourceMap(filePath: string): { [mdPath: string]: string } {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      return JSON.parse(content);
    }
  } catch (error) {
    vscode.window.showWarningMessage(`Cannot read article map file: ${error}`);
  }
  return {};
}

// 写入文章映射文件
function writeZhihuResourceMap(
  filePath: string,
  map: { [mdPath: string]: string }
): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(map, null, 2), "utf8");
  } catch (error) {
    vscode.window.showErrorMessage(`Cannot write article map file: ${error}`);
  }
}

export { readZhihuResourceMap, writeZhihuResourceMap };
