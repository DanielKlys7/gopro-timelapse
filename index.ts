#!/usr/bin/env node

import { Command } from "commander";
import { GoProWiFi, COHNConfig } from "./gopro-wifi";
import * as fs from "fs";
import * as path from "path";

const program = new Command();

program
  .name("gopro-multi")
  .description("GoPro Hero 12 Multi-Camera Controller via COHN")
  .version("1.0.0");

// Load COHN configuration
function loadCOHNConfig(): COHNConfig[] {
  const configPath = path.join(__dirname, "cohn-config.json");

  if (!fs.existsSync(configPath)) {
    console.error("Error: cohn-config.json not found!");
    console.error(
      "Please run the COHN provisioning script first to generate the configuration."
    );
    process.exit(1);
  }

  try {
    const configData = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    if (!configData.cameras || !Array.isArray(configData.cameras)) {
      console.error(
        "Error: Invalid cohn-config.json format - missing 'cameras' array"
      );
      process.exit(1);
    }

    return configData.cameras;
  } catch (error) {
    console.error(`Error loading cohn-config.json: ${error}`);
    process.exit(1);
  }
}

// Create GoPro instances for all cameras in config
function createCameras(): GoProWiFi[] {
  const configs = loadCOHNConfig();

  if (configs.length === 0) {
    console.error("Error: No cameras configured in cohn-config.json");
    process.exit(1);
  }

  console.log(`Loaded ${configs.length} camera(s) from configuration`);
  return configs.map((config) => new GoProWiFi(config));
}

// Execute action on all cameras in parallel
async function executeOnAll<T>(
  cameras: GoProWiFi[],
  action: (camera: GoProWiFi) => Promise<T>,
  actionName: string
): Promise<void> {
  console.log(`\n${actionName} on ${cameras.length} camera(s)...\n`);

  const results = await Promise.allSettled(
    cameras.map((camera) =>
      action(camera)
        .then((result) => ({
          ip: camera.getIpAddress(),
          success: true,
          result,
        }))
        .catch((error) => ({
          ip: camera.getIpAddress(),
          success: false,
          error: error.message,
        }))
    )
  );

  // Display results
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      const data = result.value;
      if (data.success) {
        console.log(`✓ ${data.ip}: Success`);
      } else {
        console.log(`✗ ${data.ip}: Failed - ${(data as any).error}`);
      }
    } else {
      console.log(`✗ Failed - ${result.reason}`);
    }
  });

  console.log("");
}

program
  .command("start")
  .description("Start timelapse on all configured cameras")
  .action(async () => {
    try {
      const cameras = createCameras();

      await executeOnAll(
        cameras,
        async (camera) => {
          await camera.startTimelapseNonBlocking();
        },
        "Starting timelapse"
      );

      console.log("✓ All cameras started.");
      console.log('Use "npm run stop-timelapse" to stop.\n');
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("stop-timelapse")
  .description("Stop timelapse on all configured cameras")
  .action(async () => {
    try {
      const cameras = createCameras();

      await executeOnAll(
        cameras,
        async (camera) => {
          await camera.stopTimelapse();
        },
        "Stopping timelapse"
      );

      console.log("✓ All cameras stopped.\n");
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("list-files")
  .description("List files on all configured cameras")
  .action(async () => {
    try {
      const cameras = createCameras();

      console.log(`\nListing files on ${cameras.length} camera(s)...\n`);

      for (const camera of cameras) {
        const ip = camera.getIpAddress();

        try {
          console.log(`📷 Camera: ${ip}`);
          const files = await camera.getMediaList();

          if (files.length === 0) {          console.log("  No files found\n");
        } else {
          console.log(`  Found ${files.length} file(s):`);
          files.forEach((file, index) => {
            // Only show size for non-zero sizes (grouped items show size only on first file)
            if (file.size > 0) {
              const sizeMB = (file.size / 1024 / 1024).toFixed(2);
              console.log(`    ${index + 1}. ${file.name} (${sizeMB} MB - cała grupa)`);
            } else {
              console.log(`    ${index + 1}. ${file.name}`);
            }
          });
          console.log("");
        }
        } catch (error) {
          console.log(
            `  ✗ Failed: ${error instanceof Error ? error.message : error}\n`
          );
        }
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("download-files")
  .description("Download all files from all configured cameras")
  .option("-o, --output <dir>", "Output directory", "./downloads")
  .action(async (options: { output: string }) => {
    try {
      const cameras = createCameras();

      console.log(`\nDownloading files from ${cameras.length} camera(s)...\n`);

      for (const camera of cameras) {
        const ip = camera.getIpAddress();
        const outputDir = `${options.output}/${ip.replace(/\./g, "_")}`;

        try {
          console.log(`📷 Camera: ${ip}`);
          const files = await camera.getMediaList();

          if (files.length === 0) {
            console.log("  No files to download\n");
            continue;
          }

          console.log(
            `  Downloading ${files.length} file(s) to ${outputDir}...`
          );
        for (const file of files) {
          try {
            await camera.downloadFile(file.folder, file.name, outputDir);
            // Only show size for non-zero sizes (grouped items show size only on first file)
            if (file.size > 0) {
              const sizeMB = (file.size / 1024 / 1024).toFixed(2);
              console.log(`    ✓ ${file.name} (${sizeMB} MB - cała grupa)`);
            } else {
              console.log(`    ✓ ${file.name}`);
            }
          } catch (error) {
            console.log(
              `    ✗ ${file.name}: ${
                error instanceof Error ? error.message : error
              }`
            );
          }
        }
          console.log("");
        } catch (error) {
          console.log(
            `  ✗ Failed: ${error instanceof Error ? error.message : error}\n`
          );
        }
      }

      console.log("✓ Download complete.\n");
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("delete-files")
  .description("Delete all files from all configured cameras")
  .option("--confirm", "Skip confirmation prompt")
  .action(async (options: { confirm?: boolean }) => {
    try {
      const cameras = createCameras();
      const configs = loadCOHNConfig();
      const ips = configs.map((c) => c.ip_address);

      if (!options.confirm) {
        console.log(
          "\n⚠️  WARNING: This will delete ALL files from ALL cameras!"
        );
        console.log(`Cameras: ${ips.join(", ")}`);
        console.log("\nTo confirm, run with --confirm flag:");
        console.log(`npm run delete-files -- --confirm\n`);
        return;
      }

      await executeOnAll(
        cameras,
        async (camera) => {
          await camera.deleteAllFiles();
        },
        "Deleting all files"
      );

      console.log("✓ All files deleted from all cameras.\n");
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Get detailed status of all configured cameras")
  .action(async () => {
    try {
      const cameras = createCameras();

      console.log(`\nGetting status from ${cameras.length} camera(s)...\n`);

      for (const camera of cameras) {
        const ip = camera.getIpAddress();

        try {
          console.log(`📷 Camera: ${ip}`);
          await camera.getDetailedStatus();

          const settings = await camera.getSettings();
          console.log("\n=== Camera Settings ===");
          console.log(JSON.stringify(settings, null, 2));
          console.log("");
        } catch (error) {
          console.log(
            `  ✗ Failed: ${error instanceof Error ? error.message : error}\n`
          );
        }
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
