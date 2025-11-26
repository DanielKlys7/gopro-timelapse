import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// Try to find compatible Python version (3.10-3.12)
function findPython(): string {
  const pythonVersions = ["python3.12", "python3.11", "python3.10", "python3"];

  for (const pyCmd of pythonVersions) {
    try {
      const version = execSync(`${pyCmd} --version 2>&1`, {
        encoding: "utf-8",
      });
      const match = version.match(/Python (\d+)\.(\d+)/);

      if (match) {
        const major = parseInt(match[1]);
        const minor = parseInt(match[2]);

        if (major === 3 && minor >= 10 && minor < 13) {
          console.log(`✅ Found compatible Python: ${version.trim()}`);
          return pyCmd;
        }
      }
    } catch (error) {
      // Try next version
      continue;
    }
  }

  throw new Error(
    "❌ Python 3.10-3.12 is required but not found.\n" +
      "   Install with: brew install python@3.12"
  );
}

// Setup Python virtual environment and install open-gopro
function setupVirtualEnv(pythonCmd: string): {
  pythonPath: string;
  pipPath: string;
} {
  const venvPath = path.join(__dirname, ".venv-gopro");
  const pythonPath = path.join(venvPath, "bin", "python");
  const pipPath = path.join(venvPath, "bin", "pip");

  // Check if venv exists and has open-gopro installed
  if (fs.existsSync(pythonPath)) {
    try {
      execSync(`${pipPath} show open-gopro`, { stdio: "ignore" });
      console.log("✅ Virtual environment ready with open-gopro\n");
      return { pythonPath, pipPath };
    } catch {
      // open-gopro not installed in existing venv, will install below
    }
  }

  // Create venv if it doesn't exist
  if (!fs.existsSync(venvPath)) {
    console.log("🔧 Creating Python virtual environment...");
    execSync(`${pythonCmd} -m venv ${venvPath}`, { stdio: "inherit" });
    console.log("✅ Virtual environment created\n");
  }

  // Install/upgrade open-gopro in venv
  console.log("📦 Installing open-gopro in virtual environment...");
  execSync(`${pipPath} install --upgrade open-gopro`, { stdio: "inherit" });
  console.log("✅ open-gopro installed\n");

  return { pythonPath, pipPath };
}

export async function provisionCOHN(): Promise<void> {
  console.log("🔧 COHN Provisioning");
  console.log("==================\n");

  // Find compatible Python and setup virtual environment
  const pythonCmd = findPython();
  const { pythonPath, pipPath } = setupVirtualEnv(pythonCmd);

  // Python script dla provisioning
  const pythonScript = `
import sys
import json
from open_gopro import WirelessGoPro

def provision_camera():
    try:
        print("🔍 Searching for GoPro cameras via Bluetooth...", file=sys.stderr)
        
        # Połącz z kamerą przez BLE
        with WirelessGoPro() as gopro:
            print(f"📷 Connected to {gopro.identifier}", file=sys.stderr)
            
            # Włącz WiFi AP
            print("📡 Enabling WiFi AP...", file=sys.stderr)
            gopro.http_command.set_cohn(enable=False)  # Disable COHN to get standard AP mode
            gopro.ble_command.enable_wifi_ap(enable=True)
            
            # Pobierz WiFi credentials
            print("🔑 Getting WiFi credentials...", file=sys.stderr)
            ssid = gopro.ble_setting.wifi_ap_ssid
            password = gopro.ble_setting.wifi_ap_password
            
            # Pobierz informacje o kamerze
            camera_info = {
                "identifier": gopro.identifier,
                "ssid": ssid,
                "password": password,
                "ip_address": "192.168.1.xxx",
                "cohn_enabled": True
            }
            
            # Wypisz JSON (tylko to będzie parsowane)
            print(json.dumps(camera_info))
            
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    provision_camera()
`;

  const scriptPath = path.join(__dirname, "temp_provision.py");
  fs.writeFileSync(scriptPath, pythonScript);

  try {
    console.log("⏳ Provisioning camera (this may take 30-60 seconds)...\n");

    const output = execSync(`${pythonPath} ${scriptPath}`, {
      encoding: "utf-8",
      stdio: ["inherit", "pipe", "inherit"],
    });

    // Parse JSON output z ostatniej linii
    const lines = output.trim().split("\n");
    const jsonLine = lines[lines.length - 1];
    const cameraInfo = JSON.parse(jsonLine);

    console.log("\n✅ Camera provisioned successfully!\n");
    console.log("📋 Camera Information:");
    console.log("======================");
    console.log(`📷 Identifier: ${cameraInfo.identifier}`);
    console.log(`📡 WiFi SSID: ${cameraInfo.ssid}`);
    console.log(`🔑 Password: ${cameraInfo.password}`);
    console.log(
      `🌐 IP Address: ${cameraInfo.ip_address} (needs manual update)\n`
    );

    // Zapisz do cohn-config.json
    const configPath = path.join(__dirname, "cohn-config.json");
    let config: any = { cameras: [] };

    if (fs.existsSync(configPath)) {
      const existingContent = fs.readFileSync(configPath, "utf-8");
      config = JSON.parse(existingContent);
    }

    // Dodaj lub zaktualizuj kamerę
    const existingIndex = config.cameras.findIndex(
      (c: any) => c.identifier === cameraInfo.identifier
    );

    if (existingIndex >= 0) {
      // Zachowaj istniejące IP jeśli było ustawione
      const existingIP = config.cameras[existingIndex].ip_address;
      cameraInfo.ip_address =
        existingIP !== "192.168.1.xxx" ? existingIP : cameraInfo.ip_address;
      config.cameras[existingIndex] = cameraInfo;
      console.log("📝 Updated existing camera in cohn-config.json");
    } else {
      config.cameras.push(cameraInfo);
      console.log("📝 Added new camera to cohn-config.json");
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`💾 Configuration saved to: ${configPath}\n`);

    console.log("📌 NEXT STEPS:");
    console.log("==============");
    console.log("1. On your GoPro camera:");
    console.log(
      "   • Go to: Preferences > Connections > Connect Device > GoPro App"
    );
    console.log("   • Connect to your home WiFi network");
    console.log("   • Note the IP address displayed on camera\n");
    console.log("2. Update cohn-config.json:");
    console.log(`   • Open: ${configPath}`);
    console.log(`   • Find camera: ${cameraInfo.identifier}`);
    console.log('   • Update "ip_address" field with the camera\'s WiFi IP\n');
    console.log("3. Test connection:");
    console.log("   npm run status\n");
  } catch (error: any) {
    if (error.stderr) {
      console.error("\n❌ Error output:", error.stderr.toString());
    }
    throw new Error(`Provisioning failed: ${error.message}`);
  } finally {
    // Cleanup
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }
  }
}

// CLI
if (require.main === module) {
  provisionCOHN()
    .then(() => {
      console.log("✅ Provisioning completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Provisioning Error:", error.message);
      console.error("\n💡 Troubleshooting:");
      console.error("   • Make sure GoPro is powered on");
      console.error("   • Make sure Bluetooth is enabled on your computer");
      console.error("   • Make sure camera is in pairing mode");
      console.error("   • Try: pip install --upgrade open-gopro");
      process.exit(1);
    });
}
