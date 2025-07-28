import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { uploadMarkdownFile } from "../service/uploadMarkdown";
import { deleteArticle, updateArticle, createArticle } from "../service/draft";
import { publishArticle } from "../service/publishArticle";
import {
  readZhihuResourceMap,
  writeZhihuResourceMap,
} from "../utils/zhihuResourceMapManager";
import { preprocessMarkdown } from "../utils/preprocess";

// Resource map file to store mapping between local Markdown files and Zhihu articles
const ZHIHU_RESOURCE_MAP_FILE = "zhihuResourceMap.json";

/**
 * Publish Markdown file to Zhihu Column
 * @param uri - URI of the active Markdown file
 */
export const zhihuPublisher = async (uri: vscode.Uri) => {
  try {
    // Get user configuration (cookie)
    const config = vscode.workspace.getConfiguration("zhihuPublisher");
    const cookie = config.get("cookie") as string;
    
    if (!cookie) {
      vscode.window.showErrorMessage("Please configure your Zhihu cookie in settings first");
      return;
    }

    // Get file and workspace information
    const mdFilePath = uri.fsPath;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

    if (!workspaceFolder) {
      vscode.window.showErrorMessage("Cannot determine workspace folder");
      return;
    }
    
    // Get relative path of the Markdown file within the workspace
    const mdFileRelativePath = path.relative(
      workspaceFolder.uri.fsPath,
      mdFilePath
    );

    // Prompt user for article title (default to file name)
    const title = await vscode.window.showInputBox({
      placeHolder: "Enter article title",
      value: path.basename(uri.fsPath, ".md"),
    });

    if (!title) {
      vscode.window.showInformationMessage("Publishing cancelled");
      return;
    }

    // Ensure resource map file exists
    const zhihuResourceMapPath = path.join(
      workspaceFolder.uri.fsPath,
      ZHIHU_RESOURCE_MAP_FILE
    );
    
    if (!fs.existsSync(zhihuResourceMapPath)) {
      fs.mkdirSync(path.dirname(zhihuResourceMapPath), { recursive: true });
      writeZhihuResourceMap(zhihuResourceMapPath, {});
    }
    
    // Read existing resource mappings
    let zhihuResourceMap = readZhihuResourceMap(zhihuResourceMapPath);

    // Preprocess Markdown content (e.g., replace local images with online links)
    let fileContent = await preprocessMarkdown(
      workspaceFolder.uri.fsPath,
      mdFileRelativePath,
      cookie
    );

    if (typeof fileContent !== "string") {
      return;
    }

    // Upload Markdown content and convert to HTML format
    const htmlContent = await uploadMarkdownFile(
      fileContent,
      cookie,
      zhihuResourceMap
    );

    // Check if article already exists on Zhihu
    const articleURL = zhihuResourceMap[mdFileRelativePath];

    if (articleURL) {
      // Extract article ID and update existing article
      const articleId = extractArticleId(articleURL);
      const isUpdateSuccess = await updateArticle(articleId, title, htmlContent, cookie);
      
      if (isUpdateSuccess) {
        const isPublishSuccess = await publishArticle(articleId, cookie);
        
        if (isPublishSuccess) {
          vscode.window.showInformationMessage(
            `Article updated successfully: [Click to view](https://zhuanlan.zhihu.com/p/${articleId})`
          );
        } else {
          vscode.window.showErrorMessage("Failed to publish article");
        }
      } else {
        vscode.window.showErrorMessage("Failed to update article");
      }
    } else {
      // Create new article
      const articleId = await createArticle(cookie);
      
      if (!articleId) {
        vscode.window.showErrorMessage(
          "Failed to create article. Please check if your cookie is valid"
        );
        return;
      }
      
      // Update and publish the newly created article
      const isUpdateSuccess = await updateArticle(articleId, title, htmlContent, cookie);
      
      if (isUpdateSuccess) {
        const isPublishSuccess = await publishArticle(articleId, cookie);
        
        if (isPublishSuccess) {
          vscode.window.showInformationMessage(
            `Article created successfully: [Click to view](https://zhuanlan.zhihu.com/p/${articleId})`
          );
          
          // Update resource mapping
          zhihuResourceMap[mdFileRelativePath] = `https://zhuanlan.zhihu.com/p/${articleId}`;
          writeZhihuResourceMap(zhihuResourceMapPath, zhihuResourceMap);
        } else {
          vscode.window.showErrorMessage("Failed to publish article");
        }
      } else {
        vscode.window.showErrorMessage("Failed to update article");
      }
    }
  } catch (error: any) {
    console.error("Error during publishing:", error);
    vscode.window.showErrorMessage(`Publish failed: ${error.message}`);
  }
};

/**
 * Extract article ID from Zhihu article URL
 * @param url - Zhihu article URL
 * @returns Article ID
 */
function extractArticleId(url: string): string {
  const parts = url.split("/");
  return parts[parts.length - 1];
}