import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

export interface S3Config {
  region: string;
  bucket: string;
  prefix?: string; // Optional prefix for S3 keys (e.g., "gopro-footage/")
}

// Load S3 config from environment variables
export function loadS3ConfigFromEnv(): S3Config {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET;
  const prefix = process.env.AWS_S3_PREFIX || "";

  if (!region || !bucket) {
    throw new Error(
      "Missing AWS configuration. Please set AWS_REGION and AWS_S3_BUCKET in .env file"
    );
  }

  return { region, bucket, prefix };
}

export class S3Uploader {
  private s3Client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(config: S3Config) {
    this.s3Client = new S3Client({ region: config.region });
    this.bucket = config.bucket;
    this.prefix = config.prefix || "";
  }

  async uploadFile(
    localPath: string,
    cameraIp: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const fileName = path.basename(localPath);
    const fileStream = fs.createReadStream(localPath);
    const fileStats = fs.statSync(localPath);

    // Create S3 key: prefix/camera-ip/YYYY-MM-DD/filename
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const s3Key = `${this.prefix}${cameraIp}/${date}/${fileName}`;

    console.log(`  Uploading ${fileName} to s3://${this.bucket}/${s3Key}`);

    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.bucket,
        Key: s3Key,
        Body: fileStream,
        ContentType: this.getContentType(fileName),
      },
    });

    if (onProgress) {
      upload.on("httpUploadProgress", (progress) => {
        if (progress.loaded && progress.total) {
          const percent = (progress.loaded / progress.total) * 100;
          onProgress(percent);
        }
      });
    }

    await upload.done();

    const s3Url = `s3://${this.bucket}/${s3Key}`;
    console.log(`  ✓ Uploaded to ${s3Url}`);
    return s3Url;
  }

  async uploadDirectory(localDir: string, cameraIp: string): Promise<string[]> {
    const uploadedUrls: string[] = [];

    if (!fs.existsSync(localDir)) {
      throw new Error(`Directory not found: ${localDir}`);
    }

    const files = fs.readdirSync(localDir);

    for (const file of files) {
      const filePath = path.join(localDir, file);

      if (fs.statSync(filePath).isFile()) {
        try {
          const url = await this.uploadFile(filePath, cameraIp);
          uploadedUrls.push(url);
        } catch (error) {
          console.error(
            `  ✗ Failed to upload ${file}: ${
              error instanceof Error ? error.message : error
            }`
          );
        }
      }
    }

    return uploadedUrls;
  }

  private getContentType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const contentTypes: { [key: string]: string } = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".lrv": "video/mp4", // GoPro low-res video
      ".thm": "image/jpeg", // GoPro thumbnail
    };

    return contentTypes[ext] || "application/octet-stream";
  }
}
