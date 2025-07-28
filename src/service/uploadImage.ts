import OSS from "ali-oss";
import * as fs from "fs";
import * as vscode from "vscode";
import md5 from "md5";
import * as path from "path";
import { ZhihuOSSAgent } from "../const/HTTP";
import { HarReplayer } from "../utils/har-replayer";

/**
 * Uploads an image buffer to Zhihu's OSS (Object Storage Service)
 * @param imageBuffer - Buffer containing the image data
 * @param cookie - Authentication cookie for Zhihu API
 * @returns URL of the uploaded image or void if upload fails
 */
export const uploadImage = async (
  imageBuffer: Buffer,
  cookie: string
): Promise<string | void> => {
  try {
    // Generate MD5 hash of the image buffer for identification
    const imageHash = md5(imageBuffer);
    
    // Initialize HAR replayer to mimic browser requests
    const replayer = new HarReplayer();
    const harFilePath = path.join(
      vscode.extensions.getExtension("jack-base.zhihu-publisher-vscode")!.extensionPath,
      "/resource/uploadImage.har"
    );
    replayer.init(harFilePath);

    // Modify initial request with authentication cookie and image hash
    replayer.modifyRequest(0, {
      headers: { cookie },
      postData: {
        text: `{"image_hash":"${imageHash}","source":"article"}`,
      },
      method: "POST",
    });

    // Execute prefetch request to get upload credentials
    const prefetchResp = await replayer.replayRequestByIndex(0);
    const prefetchBody = prefetchResp.replayedResponse?.data;
    
    if (!prefetchBody?.upload_token) {
      console.error("Missing upload_token in prefetch response:", prefetchBody);
      return;
    }

    // Configure OSS client with temporary credentials
    const ossConfig = { ...ZhihuOSSAgent.options };
    ossConfig.accessKeyId = prefetchBody.upload_token.access_id;
    ossConfig.accessKeySecret = prefetchBody.upload_token.access_key;
    ossConfig.stsToken = prefetchBody.upload_token.access_token;
    
    const ossClient = new OSS(ossConfig);

    // Upload image to OSS with hash-based filename
    const uploadResult = await ossClient.put(`v2-${imageHash}`, imageBuffer);
    console.log("Upload successful:", uploadResult);

    // Return formatted image URL
    return `https://pic4.zhimg.com/80/v2-${imageHash}`;
  } catch (error) {
    console.error("Error uploading image:", error);
    vscode.window.showErrorMessage(`Image upload failed: ${(error as Error).message}`);
    return;
  }
};