#!/usr/bin/env node

import { Command } from "commander";
import { GoProWiFi, COHNConfig } from "./gopro-wifi";
import { S3Uploader, loadS3ConfigFromEnv } from "./s3-uploader";
import { getNotificationHandler } from "./notification-handler";
import { provisionCOHN } from "./cohn-provision";
import * as fs from "fs";
import * as path from "path";

const program = new Command();
const notifier = getNotificationHandler();

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
    console.error("\n❌ Error: Nie znaleziono żadnych kamer w konfiguracji!");
    console.error("📝 Plik cohn-config.json nie zawiera żadnych kamer.");
    console.error(
      "💡 Uruchom skrypt COHN provisioning, aby dodać kamery do konfiguracji.\n"
    );
    process.exit(1);
  }

  console.log(`Loaded ${configs.length} camera(s) from configuration`);
  const status = configs.map((config) => new GoProWiFi(config));
  return status;
}

// Execute action on all cameras in parallel
// Returns true if all succeeded, false if any failed
async function executeOnAll<T>(
  cameras: GoProWiFi[],
  action: (camera: GoProWiFi) => Promise<T>,
  actionName: string
): Promise<boolean> {
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

  // Collect errors for batch notification
  const errors: Array<{ ip: string; error: string }> = [];
  let successCount = 0;

  // Display results
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      const data = result.value;
      if (data.success) {
        console.log(`✓ ${data.ip}: Success`);
        successCount++;
      } else {
        console.log(`✗ ${data.ip}: Failed - ${(data as any).error}`);
        errors.push({ ip: data.ip, error: (data as any).error });
      }
    } else {
      console.log(`✗ Failed - ${result.reason}`);
      errors.push({ ip: "unknown", error: result.reason });
    }
  });

  console.log("");

  // Send single batch notification if there were any errors
  if (errors.length > 0) {
    const errorMessage = errors.map((e) => `📷 ${e.ip}: ${e.error}`).join("\n");

    const summary = `${errors.length} z ${cameras.length} kamer nie powiodło się`;

    await notifier.sendError(actionName, `${summary}\n\n${errorMessage}`);
  }

  return errors.length === 0;
}

program
  .command("start")
  .description("Start timelapse on all configured cameras")
  .action(async () => {
    try {
      const cameras = createCameras();

      const success = await executeOnAll(
        cameras,
        async (camera) => {
          await camera.startTimelapseNonBlocking();
        },
        "Starting timelapse"
      );

      if (success) {
        console.log("✓ All cameras started.");
        console.log('Use "npm run stop-timelapse" to stop.\n');
      } else {
        console.error("✗ Some cameras failed to start.\n");
        process.exit(1);
      }
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

      const success = await executeOnAll(
        cameras,
        async (camera) => {
          await camera.stopTimelapse();
        },
        "Stopping timelapse"
      );

      if (success) {
        console.log("✓ All cameras stopped.\n");
      } else {
        console.error("✗ Some cameras failed to stop.\n");
        process.exit(1);
      }
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

          if (files.length === 0) {
            console.log("  No files found\n");
          } else {
            console.log(`  Found ${files.length} file(s):`);
            files.forEach((file, index) => {
              // Only show size for non-zero sizes (grouped items show size only on first file)
              if (file.size > 0) {
                const sizeMB = (file.size / 1024 / 1024).toFixed(2);
                console.log(
                  `    ${index + 1}. ${file.name} (${sizeMB} MB - cała grupa)`
                );
              } else {
                console.log(`    ${index + 1}. ${file.name}`);
              }
            });
            console.log("");
          }
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.log(`  ✗ Failed: ${errorMsg}\n`);
          // Send notification on error
          await notifier.sendError("list-files", errorMsg, ip);
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

      const errors: Array<{ ip: string; error: string }> = [];
      let totalDownloaded = 0;

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

          let cameraErrors = 0;
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
              totalDownloaded++;
            } catch (error) {
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              console.log(`    ✗ ${file.name}: ${errorMsg}`);
              cameraErrors++;
            }
          }

          if (cameraErrors > 0) {
            errors.push({
              ip,
              error: `${cameraErrors} z ${files.length} plików nie zostało pobranych`,
            });
          }
          console.log("");
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.log(`  ✗ Failed: ${errorMsg}\n`);
          errors.push({ ip, error: errorMsg });
        }
      }

      // Send single batch notification if there were any errors
      if (errors.length > 0) {
        const errorMessage = errors
          .map((e) => `📷 ${e.ip}: ${e.error}`)
          .join("\n");

        const summary = `Problemy podczas pobierania z ${errors.length} z ${cameras.length} kamer`;

        await notifier.sendError(
          "download-files",
          `${summary}\n\n${errorMessage}`
        );
      }

      if (errors.length > 0) {
        console.error(
          `✗ Download completed with errors. Downloaded ${totalDownloaded} files.\n`
        );
        process.exit(1);
      } else {
        console.log(
          `✓ Download complete. Downloaded ${totalDownloaded} files.\n`
        );
      }
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

      const success = await executeOnAll(
        cameras,
        async (camera) => {
          await camera.deleteAllFiles();
        },
        "Deleting all files"
      );

      if (success) {
        console.log("✓ All files deleted from all cameras.\n");
      } else {
        console.error("✗ Some cameras failed to delete files.\n");
        process.exit(1);
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("upload-files")
  .description("Upload downloaded files to AWS S3")
  .option(
    "-d, --dir <directory>",
    "Directory with downloaded files",
    "./downloads"
  )
  .option("--delete-after-upload", "Delete local files after successful upload")
  .action(async (options: { dir: string; deleteAfterUpload?: boolean }) => {
    try {
      const s3Config = loadS3ConfigFromEnv();
      const uploader = new S3Uploader(s3Config);

      console.log(`\nUploading files from ${options.dir} to S3...\n`);
      console.log(`Bucket: ${s3Config.bucket}`);
      console.log(`Region: ${s3Config.region}\n`);

      if (!fs.existsSync(options.dir)) {
        console.error(`Error: Directory not found: ${options.dir}`);
        process.exit(1);
      }

      // Get all camera directories
      const cameraDirs = fs.readdirSync(options.dir).filter((item) => {
        const itemPath = path.join(options.dir, item);
        return fs.statSync(itemPath).isDirectory();
      });

      if (cameraDirs.length === 0) {
        console.log("No camera directories found.");
        return;
      }

      let totalUploaded = 0;
      const errors: Array<{ ip: string; error: string }> = [];
      const successfulCameras: string[] = [];

      for (const cameraDir of cameraDirs) {
        const cameraDirPath = path.join(options.dir, cameraDir);
        const cameraIp = cameraDir.replace(/_/g, "."); // Convert 192_168_0_142 back to 192.168.0.142

        try {
          console.log(`📷 Camera: ${cameraIp}`);
          const uploadedUrls = await uploader.uploadDirectory(
            cameraDirPath,
            cameraIp
          );

          console.log(`  ✓ Uploaded ${uploadedUrls.length} file(s)\n`);
          totalUploaded += uploadedUrls.length;

          // Mark this camera as successful
          successfulCameras.push(cameraDir);

          // Delete local files ONLY if upload succeeded AND flag is set
          if (options.deleteAfterUpload && uploadedUrls.length > 0) {
            console.log(`  🗑️  Usuwam pliki lokalne dla kamery ${cameraIp}...`);
            const files = fs.readdirSync(cameraDirPath);
            let deletedCount = 0;

            for (const file of files) {
              const filePath = path.join(cameraDirPath, file);
              if (fs.statSync(filePath).isFile()) {
                fs.unlinkSync(filePath);
                deletedCount++;
              }
            }

            console.log(`  ✓ Usunięto ${deletedCount} plików lokalnych\n`);

            // Try to remove empty directory
            try {
              const remainingFiles = fs.readdirSync(cameraDirPath);
              if (remainingFiles.length === 0) {
                fs.rmdirSync(cameraDirPath);
                console.log(`  ✓ Usunięto pusty katalog ${cameraDir}\n`);
              }
            } catch (e) {
              // Ignore errors when removing directory
            }
          }
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.log(`  ✗ Failed: ${errorMsg}\n`);
          console.log(
            `  ⚠️  Pliki lokalne dla ${cameraIp} zostały ZACHOWANE (można spróbować ponownie)\n`
          );
          errors.push({ ip: cameraIp, error: errorMsg });
        }
      }

      // Send single batch notification if there were any errors
      if (errors.length > 0) {
        const errorMessage = errors
          .map((e) => `📷 ${e.ip}: ${e.error}`)
          .join("\n");

        const summary = `Problemy podczas uploadu z ${errors.length} z ${cameraDirs.length} kamer`;

        await notifier.sendError(
          "upload-files",
          `${summary}\n\n${errorMessage}`
        );
      }

      // Summary
      console.log("\n=== Upload Summary ===");
      console.log(`Total files uploaded: ${totalUploaded}`);
      console.log(
        `Successful cameras: ${successfulCameras.length}/${cameraDirs.length}`
      );

      if (options.deleteAfterUpload) {
        console.log(
          `Local files deleted for: ${successfulCameras.length} camera(s)`
        );
        if (errors.length > 0) {
          console.log(
            `⚠️  Local files PRESERVED for ${errors.length} failed camera(s) - można spróbować ponownie!`
          );
        }
      }
      console.log("");

      if (errors.length > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Get status of all configured cameras")
  .action(async () => {
    try {
      const cameras = createCameras();

      console.log(`\nGetting status from ${cameras.length} camera(s)...\n`);

      for (const camera of cameras) {
        const ip = camera.getIpAddress();

        try {
          console.log(`📷 Camera: ${ip}`);
          const status = await camera.getDetailedStatus();

          // Status już zawiera settings, więc możemy je pokazać osobno jeśli chcemy
          if (status.settings) {
            console.log("\n=== Camera Settings ===");
            console.log(JSON.stringify(status.settings, null, 2));
            console.log("");
          }
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.log(`  ✗ Failed: ${errorMsg}\n`);
          // Send notification on status check error
          await notifier.sendError("status", errorMsg, ip);
        }
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("clean-local")
  .description("Clean local downloaded files")
  .option(
    "-d, --dir <directory>",
    "Directory with downloaded files",
    "./downloads"
  )
  .option("--confirm", "Skip confirmation prompt")
  .action(async (options: { dir: string; confirm?: boolean }) => {
    try {
      if (!fs.existsSync(options.dir)) {
        console.log(`Directory ${options.dir} does not exist.`);
        return;
      }

      const cameraDirs = fs.readdirSync(options.dir).filter((item) => {
        const itemPath = path.join(options.dir, item);
        return fs.statSync(itemPath).isDirectory();
      });

      if (cameraDirs.length === 0) {
        console.log("No camera directories found.");
        return;
      }

      // Count files
      let totalFiles = 0;
      let totalSize = 0;

      for (const cameraDir of cameraDirs) {
        const cameraDirPath = path.join(options.dir, cameraDir);
        const files = fs.readdirSync(cameraDirPath);

        for (const file of files) {
          const filePath = path.join(cameraDirPath, file);
          if (fs.statSync(filePath).isFile()) {
            totalFiles++;
            totalSize += fs.statSync(filePath).size;
          }
        }
      }

      const sizeMB = (totalSize / 1024 / 1024).toFixed(2);

      if (!options.confirm) {
        console.log(
          "\n⚠️  WARNING: This will delete ALL local downloaded files!"
        );
        console.log(
          `Found ${totalFiles} file(s) in ${cameraDirs.length} camera directory(ies)`
        );
        console.log(`Total size: ${sizeMB} MB`);
        console.log("\nTo confirm, run with --confirm flag:");
        console.log(`npm run clean-local -- --confirm\n`);
        return;
      }

      console.log(`\nDeleting ${totalFiles} file(s) (${sizeMB} MB)...\n`);

      let deletedFiles = 0;
      let deletedDirs = 0;

      for (const cameraDir of cameraDirs) {
        const cameraDirPath = path.join(options.dir, cameraDir);
        const cameraIp = cameraDir.replace(/_/g, ".");

        console.log(`📷 Camera: ${cameraIp}`);

        const files = fs.readdirSync(cameraDirPath);
        for (const file of files) {
          const filePath = path.join(cameraDirPath, file);
          if (fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
            deletedFiles++;
          }
        }

        // Remove empty directory
        try {
          fs.rmdirSync(cameraDirPath);
          deletedDirs++;
          console.log(`  ✓ Deleted ${files.length} file(s) and directory`);
        } catch (e) {
          console.log(`  ✓ Deleted ${files.length} file(s)`);
        }
      }

      console.log(
        `\n✓ Cleaned ${deletedFiles} file(s) and ${deletedDirs} director(ies)\n`
      );
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("provision-cohn")
  .description(
    "Provision GoPro camera for COHN (Camera on Home Network) via Bluetooth"
  )
  .action(async () => {
    try {
      await provisionCOHN();
    } catch (error: any) {
      console.error("❌ Provisioning failed:", error.message);
      process.exit(1);
    }
  });

program.parse();
