import axios, { AxiosInstance } from "axios";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";

export interface GoProFile {
  folder: string;
  name: string;
  size: number;
  created: string;
  isGroupItem?: boolean;
  groupId?: string;
  groupMemberId?: string;
}

export interface COHNConfig {
  certificate: string;
  username: string;
  password: string;
  ip_address: string;
}

export class GoProWiFi {
  private client: AxiosInstance;
  private baseUrl: string;
  private config: COHNConfig;

  // Retry configuration
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 2000;

  constructor(config: COHNConfig) {
    this.config = config;
    this.baseUrl = `https://${config.ip_address}`;

    // Create HTTPS agent that accepts self-signed certificates
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false, // Accept self-signed certificates
    });

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      httpsAgent,
      auth: {
        username: config.username,
        password: config.password,
      },
      headers: {
        Connection: "keep-alive",
      },
    });
  }

  getIpAddress(): string {
    return this.config.ip_address;
  }

  async wakeUp(): Promise<void> {
    try {
      // COHN cameras should stay connected, but we can check status
      await this.client.get("/gopro/camera/state", {
        timeout: 5000,
      });
    } catch (error) {
      // Ignore errors - camera might be sleeping
    }
  }

  async getStatus(): Promise<any> {
    try {
      await this.wakeUp();
      const response = await this.client.get("/gopro/camera/state");
      return response.data;
    } catch (error: any) {
      if (error.code === "ECONNREFUSED") {
        throw new Error(
          `Cannot connect to GoPro at ${this.config.ip_address} - check if camera is on network`
        );
      } else if (error.code === "ETIMEDOUT" || error.code === "ECONNRESET") {
        throw new Error(
          `Connection timeout - camera may be sleeping or unreachable`
        );
      }
      throw new Error(`Failed to get status: ${error.message || error}`);
    }
  }

  async getDetailedStatus(): Promise<any> {
    try {
      const status = await this.getStatus();
      console.log("\n=== Camera Status ===");
      console.log("IP:", this.config.ip_address);
      console.log("Raw status:", JSON.stringify(status, null, 2));
      return status;
    } catch (error) {
      throw new Error(`Failed to get detailed status: ${error}`);
    }
  }

  async getSettings(): Promise<any> {
    try {
      const status = await this.getStatus();
      // Settings są już w odpowiedzi status API
      return status.settings || {};
    } catch (error) {
      throw new Error(`Failed to get settings: ${error}`);
    }
  }

  async getMediaList(): Promise<GoProFile[]> {
    try {
      await this.wakeUp();
      const response = await this.client.get("/gopro/media/list");
      const files: GoProFile[] = [];

      if (response.data && response.data.media) {
        for (const directory of response.data.media) {
          const folder = directory.d;
          
          for (const file of directory.fs) {
            // Check if this file has a RAW companion (indicated by raw: "1")
            const hasRaw = file.raw === "1" || file.raw === 1;
            
            // Check if this is a grouped media item
            // Grouped items have 'b' (first group member ID) and 'l' (last group member ID) keys
            if (file.b !== undefined && file.l !== undefined) {
              // This is a grouped media item (Burst, Time Lapse, Night Lapse, etc.)
              const firstMemberId = parseInt(file.b);
              const lastMemberId = parseInt(file.l);
              const baseName = file.n;
              const totalGroupSize = file.s;
              let isFirstInGroup = true;

              // Extract group ID and extension from filename
              // Format: GXXXYYYY.ZZZ where XXX is group ID, YYY is member ID, ZZZ is extension
              const match = baseName.match(/^G(\d{3})(\d{4})\.(.+)$/);

              if (match) {
                const groupId = match[1];
                const extension = match[3];

                // Generate all individual filenames for the group
                for (
                  let memberId = firstMemberId;
                  memberId <= lastMemberId;
                  memberId++
                ) {
                  const memberIdStr = memberId.toString().padStart(4, "0");
                  const fileName = `G${groupId}${memberIdStr}.${extension}`;

                  // Add JPG file
                  files.push({
                    folder: folder,
                    name: fileName,
                    // Only show size for the first file in group, 0 for others
                    size: isFirstInGroup ? totalGroupSize : 0,
                    created: file.cre || file.mod || "",
                    isGroupItem: true,
                    groupId: groupId,
                    groupMemberId: memberIdStr,
                  });

                  // Add RAW file if it exists
                  if (hasRaw) {
                    const rawFileName = `G${groupId}${memberIdStr}.GPR`;
                    files.push({
                      folder: folder,
                      name: rawFileName,
                      size: 0, // RAW file size is not provided separately
                      created: file.cre || file.mod || "",
                      isGroupItem: true,
                      groupId: groupId,
                      groupMemberId: memberIdStr,
                    });
                  }

                  isFirstInGroup = false;
                }
              } else {
                // Fallback if filename doesn't match expected pattern
                console.warn(
                  `Grouped file doesn't match expected pattern: ${baseName}`
                );
                files.push({
                  folder: folder,
                  name: file.n,
                  size: file.s,
                  created: file.cre || file.mod || "",
                });
                
                // Add RAW companion if exists
                if (hasRaw) {
                  const rawName = file.n.replace(/\.(JPG|jpg)$/, ".GPR");
                  files.push({
                    folder: folder,
                    name: rawName,
                    size: 0,
                    created: file.cre || file.mod || "",
                  });
                }
              }
            } else {
              // Regular single file - add JPG
              files.push({
                folder: folder,
                name: file.n,
                size: file.s,
                created: file.cre || file.mod || "",
              });
              
              // Add RAW companion if exists
              if (hasRaw) {
                const rawName = file.n.replace(/\.(JPG|jpg)$/, ".GPR");
                files.push({
                  folder: folder,
                  name: rawName,
                  size: 0, // RAW file size is not provided separately in API
                  created: file.cre || file.mod || "",
                });
              }
            }
          }
        }
      }

      return files;
    } catch (error) {
      throw new Error(`Failed to get media list: ${error}`);
    }
  }

  async downloadFile(
    folder: string,
    filename: string,
    outputDir: string = "./downloads"
  ): Promise<string> {
    try {
      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const url = `/videos/DCIM/${folder}/${filename}`;
      const outputPath = path.join(outputDir, filename);

      console.log(`Downloading ${filename}...`);

      const response = await this.client.get(url, {
        responseType: "stream",
        timeout: 300000, // 5 minutes for large files
      });

      const writer = fs.createWriteStream(outputPath);

      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on("finish", () => {
          console.log(`Downloaded: ${filename}`);
          resolve(outputPath);
        });
        writer.on("error", reject);
      });
    } catch (error) {
      throw new Error(`Failed to download file: ${error}`);
    }
  }

  async downloadAllFiles(outputDir: string = "./downloads"): Promise<string[]> {
    const files = await this.getMediaList();
    const downloadedPaths: string[] = [];

    for (const file of files) {
      const filePath = await this.downloadFile(
        file.folder,
        file.name,
        outputDir
      );
      downloadedPaths.push(filePath);
    }

    return downloadedPaths;
  }

  async deleteFile(folder: string, filename: string): Promise<void> {
    try {
      // GoPro uses GET request for delete commands
      const url = `/gp/gpControl/command/storage/delete?p=${folder}/${filename}`;
      await this.client.get(url);
      console.log(`Deleted: ${filename}`);
    } catch (error) {
      throw new Error(`Failed to delete file: ${error}`);
    }
  }

  async deleteAllFiles(): Promise<void> {
    try {
      // GoPro uses GET request for delete all command
      await this.client.get("/gp/gpControl/command/storage/delete/all");
      console.log("All files deleted");
    } catch (error) {
      throw new Error(`Failed to delete all files: ${error}`);
    }
  }

  async startTimelapseNonBlocking(): Promise<void> {
    return this.withRetry(async () => {
      await this.wakeUp();

      // Start shutter
      console.log("Starting timelapse...");
      await this.client.get("/gopro/camera/shutter/start");
      console.log(
        "✓ Time lapse photo started - will take photos every 10 seconds"
      );
    }, "Start timelapse");
  }

  async stopTimelapse(): Promise<void> {
    return this.withRetry(async () => {
      await this.wakeUp();
      await this.client.get("/gopro/camera/shutter/stop");
      console.log("Timelapse stopped");
    }, "Stop timelapse");
  }

  async keepAlive(): Promise<void> {
    try {
      await this.client.get("/gopro/camera/state");
    } catch (error) {
      // Ignore errors for keep-alive
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Helper function for retry logic
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    retries: number = this.MAX_RETRIES
  ): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const isLastAttempt = attempt === retries;

        if (isLastAttempt) {
          throw error;
        }

        console.log(
          `⚠️  ${operationName} failed (attempt ${attempt}/${retries}), retrying in ${this.RETRY_DELAY_MS}ms...`
        );

        // Wait before retry
        await new Promise((resolve) =>
          setTimeout(resolve, this.RETRY_DELAY_MS)
        );
      }
    }

    throw new Error(`${operationName} failed after ${retries} attempts`);
  }
}
