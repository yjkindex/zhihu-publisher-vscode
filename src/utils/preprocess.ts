import * as fs from "fs";
import path from "path";
import { uploadImage } from "../service/uploadImage";
import { readZhihuResourceMap, writeZhihuResourceMap } from "./zhihuResourceMapManager";
import vscode from "vscode";
import { downloadImage } from "../service/downloadImage";

/**
 * Replaces all image paths in Markdown text with their corresponding web URLs from the resource map
 * @param markdownText The original Markdown content containing image references
 * @param resourceMap A mapping object where keys are local image paths and values are online URLs
 * @returns Markdown text with local image paths replaced by online URLs
 */
function replaceImagesWithLinks(
  markdownText: string,
  resourceMap: Record<string, string>
): string {
  // Regular expression pattern to match Markdown image syntax: ![alt](path "title")
  const imageRegex = /!\[(.*?)\]\((.*?)\)/g;

  return markdownText.replace(
    imageRegex,
    (match, altText, imagePath) => {
      // Clean the path by removing any trailing title/parameters (e.g., {width=50%} or "image title")
      const cleanPath = imagePath.split(/\s+/)[0].replace(/{.*}$/, "");
      // Get the corresponding online URL from resource map
      const onlineUrl = resourceMap[cleanPath];

      // Return original match if no replacement URL exists, otherwise return updated image syntax
      return onlineUrl ? `![${altText}](${onlineUrl})` : match;
    }
  );
}

/**
 * Extracts all image paths from Markdown text
 * @param markdownText The Markdown content to parse
 * @returns Array of cleaned local image paths
 */
function extractImagePaths(markdownText: string): string[] {
  const imagePaths: string[] = [];
  // Regular expression to identify Markdown image patterns
  const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
  let match: RegExpExecArray | null;

  // Iterate through all matches in the Markdown text
  while ((match = imageRegex.exec(markdownText)) !== null) {
    // Extract and clean the image path from the match
    const rawPath = match[2].trim();
    // Remove any title text or dimension parameters from the path
    const cleanPath = rawPath.split(/\s+/)[0].replace(/{.*}$/, "");
    
    if (cleanPath) {
      imagePaths.push(cleanPath);
    }
  }
  console.log("Extracted image paths:", imagePaths);
  return imagePaths;
}

/**
 * Checks if a path is a URL (starts with http:// or https://)
 * @param path The path to check
 * @returns True if the path is a URL, false otherwise
 */
function isHttpUrl(path: string): boolean {
  return /^https?:\/\//i.test(path);
}

/**
 * Preprocesses Markdown content by uploading local images to Zhihu and replacing paths with online URLs
 * @param workspaceFolder Absolute path to the workspace root directory
 * @param markdownPath Relative path to the Markdown file within the workspace
 * @param cookie Authentication cookie for Zhihu API
 * @returns Processed Markdown text with online image URLs, or void if processing fails
 */
export async function preprocessMarkdown(
  workspaceFolder: string,
  markdownPath: string,
  cookie: string,
): Promise<string | void> {
  try {
    // Load existing resource mapping (local paths → online URLs)
    const resourceMapPath = path.join(workspaceFolder, "zhihuResourceMap.json");
    let resourceMap = readZhihuResourceMap(resourceMapPath);

    // Read the original Markdown content from file
    const fullMarkdownPath = path.join(workspaceFolder, markdownPath);
    let markdownContent = fs.readFileSync(fullMarkdownPath, "utf-8");

    // Convert inline LaTeX formulas ($...$) to block-style ($$...$$) for Zhihu compatibility
    markdownContent = markdownContent.replace(
      /(?<!\$)\$(?!\$)(.*?)(?<!\$)\$(?!\$)/g,
      (match, formulaContent) => `$$${formulaContent}$$`
    );

    // Extract all image paths from the Markdown content
    const imagePaths = extractImagePaths(markdownContent);

    // Create upload tasks for images not already in the resource map
    const uploadPromises = imagePaths.map(async (originalPath) => {
      // Skip upload if image is already mapped
      if (resourceMap[originalPath]) {
        return;
      }

      try {
        let imageBuffer: Buffer;
        
        if (isHttpUrl(originalPath)) {
          // Handle HTTP/HTTPS images: download first
          console.log(`Downloading image from URL: ${originalPath}`);
          imageBuffer = await downloadImage(originalPath);
        } else {
          // Handle local images: read from file system
          const fullImagePath = path.join(workspaceFolder, path.dirname(markdownPath), originalPath);
          imageBuffer = fs.readFileSync(fullImagePath);
        }

        // Upload image to Zhihu and get online URL
        const imageUrl = await uploadImage(imageBuffer, cookie);

        if (typeof imageUrl === "string") {
          console.log(`Successfully processed image: ${originalPath}`);
          resourceMap[originalPath] = imageUrl; // Update mapping with original path as key
        }
      } catch (error) {
        console.error(`Error processing image ${originalPath}:`, error);
      }
    });

    // Wait for all uploads to complete
    await Promise.all(uploadPromises);

    // Save updated resource mappings to file
    writeZhihuResourceMap(resourceMapPath, resourceMap);

    // Replace all original image paths with their corresponding online URLs
    markdownContent = replaceImagesWithLinks(markdownContent, resourceMap);
    console.log("Uploaded markdownContent:", markdownContent);
    console.log("Markdown preprocessing completed successfully");
    return markdownContent;
  } catch (error) {
    console.error("Error during Markdown preprocessing:", error);
    vscode.window.showErrorMessage(`Failed to preprocess Markdown: ${(error as Error).message}`);
  }
}
