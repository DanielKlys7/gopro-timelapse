import https from "https";
import fs from "fs";
import path from "path";

interface CohnConfig {
  username: string;
  password: string;
  ip_address: string;
  base_url: string;
  certificate: string;
}

export class GoProCOHN {
  private config: CohnConfig;
  private httpsAgent: https.Agent;

  constructor(configPath: string = "./cohn-config.json") {
    // Load configuration
    const configFile = fs.readFileSync(configPath, "utf-8");
    this.config = JSON.parse(configFile);

    // Create HTTPS agent with custom CA certificate
    this.httpsAgent = new https.Agent({
      ca: this.config.certificate,
      rejectUnauthorized: true,
    });
  }

  /**
   * Make an authenticated HTTPS request to the GoPro camera
   */
  private async request(
    method: string,
    endpoint: string,
    body?: any
  ): Promise<any> {
    const url = `${this.config.base_url}${endpoint}`;

    // Create Basic Auth header
    const auth = Buffer.from(
      `${this.config.username}:${this.config.password}`
    ).toString("base64");

    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        method,
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        agent: this.httpsAgent,
      };

      const req = https.request(url, options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve(parsed);
          } catch (e) {
            resolve(data);
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Get camera status
   */
  async getStatus(): Promise<any> {
    return this.request("GET", "/gopro/camera/state");
  }

  /**
   * Get camera settings
   */
  async getSettings(): Promise<any> {
    return this.request("GET", "/gopro/camera/setting");
  }

  /**
   * Set a camera setting
   * @param settingId - The setting ID
   * @param value - The value to set
   */
  async setSetting(settingId: number, value: number): Promise<any> {
    return this.request(
      "GET",
      `/gopro/camera/setting?setting=${settingId}&option=${value}`
    );
  }

  /**
   * Start video recording
   */
  async startRecording(): Promise<any> {
    return this.request("GET", "/gopro/camera/shutter/start");
  }

  /**
   * Stop video recording
   */
  async stopRecording(): Promise<any> {
    return this.request("GET", "/gopro/camera/shutter/stop");
  }

  /**
   * Get media list
   */
  async getMediaList(): Promise<any> {
    return this.request("GET", "/gopro/media/list");
  }

  /**
   * Keep the camera awake
   */
  async keepAlive(): Promise<any> {
    return this.request("GET", "/gopro/camera/keep_alive");
  }

  /**
   * Get camera info
   */
  async getInfo(): Promise<any> {
    return this.request("GET", "/gopro/camera/info");
  }

  /**
   * Download a media file
   * @param filePath - Path to the file on the camera (from media list)
   * @param outputPath - Local path to save the file
   */
  async downloadMedia(filePath: string, outputPath: string): Promise<void> {
    const url = `${this.config.base_url}/videos/DCIM${filePath}`;
    const auth = Buffer.from(
      `${this.config.username}:${this.config.password}`
    ).toString("base64");

    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        headers: {
          Authorization: `Basic ${auth}`,
        },
        agent: this.httpsAgent,
      };

      https
        .get(url, options, (res) => {
          const fileStream = fs.createWriteStream(outputPath);
          res.pipe(fileStream);

          fileStream.on("finish", () => {
            fileStream.close();
            resolve();
          });

          fileStream.on("error", (err) => {
            fs.unlink(outputPath, () => reject(err));
          });
        })
        .on("error", reject);
    });
  }
}

// Example usage
if (require.main === module) {
  (async () => {
    try {
      const gopro = new GoProCOHN();

      console.log("Getting camera info...");
      const info = await gopro.getInfo();
      console.log("Camera info:", JSON.stringify(info, null, 2));

      console.log("\nGetting camera status...");
      const status = await gopro.getStatus();
      console.log("Camera status:", JSON.stringify(status, null, 2));

      console.log("\nKeeping camera alive...");
      await gopro.keepAlive();
      console.log("Keep alive sent");
    } catch (error) {
      console.error("Error:", error);
    }
  })();
}
