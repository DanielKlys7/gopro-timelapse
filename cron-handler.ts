import cron from "node-cron";
import { exec } from "child_process";

const logWithTimestamp = (emoji: string, message: string) => {
  const timestamp = new Date().toLocaleString("pl-PL", {
    dateStyle: "short",
    timeStyle: "medium",
  });
  console.log(`[${timestamp}] ${emoji} ${message}`);
};

const cronHandler = () => {
  logWithTimestamp("🚀", "Cron Handler uruchomiony");
  logWithTimestamp("📅", "Harmonogram zadań:");
  console.log("  • 11:03 - Status (keep-alive)");
  console.log("  • 11:05 - Start timelapse");
  console.log("  • 12:00 - Stop timelapse");
  console.log("  • 12:05 - Pobranie zdjęć");
  console.log("  • 12:30 - Wyczyszczenie plików\n");

  // Keep-alive status o 11:03 (2 minuty przed startem)
  cron.schedule("3 12 * * *", () => {
    logWithTimestamp("💓", "Keep-alive: Sprawdzam status GoPro...");
    exec("npm run status", (error, stdout, stderr) => {
      if (error) {
        logWithTimestamp(
          "❌",
          `Błąd podczas sprawdzania statusu: ${error.message}`
        );
        return;
      }
      if (stderr) {
        logWithTimestamp("⚠️", `stderr: ${stderr}`);
        return;
      }
      logWithTimestamp("✅", "Status GoPro - OK");
      if (stdout) console.log(stdout);
    });
  });

  // Start timelapse o 11:05
  cron.schedule("5 12 * * *", () => {
    logWithTimestamp("▶️", "Uruchamiam timelapse...");
    exec("npm run start-timelapse", (error, stdout, stderr) => {
      if (error) {
        logWithTimestamp(
          "❌",
          `Błąd podczas uruchamiania timelapse: ${error.message}`
        );
        return;
      }
      if (stderr) {
        logWithTimestamp("⚠️", `stderr: ${stderr}`);
        return;
      }
      logWithTimestamp("✅", "Timelapse uruchomiony pomyślnie");
      if (stdout) console.log(stdout);
    });
  });

  // Stop timelapse o 12:00
  cron.schedule("0 13 * * *", () => {
    logWithTimestamp("⏹️", "Zatrzymuję timelapse...");
    exec("npm run stop-timelapse", (error, stdout, stderr) => {
      if (error) {
        logWithTimestamp(
          "❌",
          `Błąd podczas zatrzymywania timelapse: ${error.message}`
        );
        return;
      }
      if (stderr) {
        logWithTimestamp("⚠️", `stderr: ${stderr}`);
        return;
      }
      logWithTimestamp("✅", "Timelapse zatrzymany pomyślnie");
      if (stdout) console.log(stdout);
    });
  });

  // Download files o 12:05
  cron.schedule("5 13 * * *", () => {
    logWithTimestamp("📥", "Pobieram zdjęcia z GoPro...");
    exec("npm run download-files", (error, stdout, stderr) => {
      if (error) {
        logWithTimestamp(
          "❌",
          `Błąd podczas pobierania zdjęć: ${error.message}`
        );
        return;
      }
      if (stderr) {
        logWithTimestamp("⚠️", `stderr: ${stderr}`);
        return;
      }
      logWithTimestamp("✅", "Zdjęcia pobrane pomyślnie");
      if (stdout) console.log(stdout);
    });
  });

  // Delete files o 12:30
  cron.schedule("30 13 * * *", () => {
    logWithTimestamp("🗑️", "Czyszczę pliki z GoPro...");
    exec("npm run delete-files -- --confirm", (error, stdout, stderr) => {
      if (error) {
        logWithTimestamp(
          "❌",
          `Błąd podczas czyszczenia plików: ${error.message}`
        );
        return;
      }
      if (stderr) {
        logWithTimestamp("⚠️", `stderr: ${stderr}`);
        return;
      }
      logWithTimestamp("✅", "Pliki wyczyszczone pomyślnie");
      if (stdout) console.log(stdout);
    });
  });
};

cronHandler();
