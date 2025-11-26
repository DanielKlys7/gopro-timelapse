import cron from "node-cron";
import { exec } from "child_process";
import { getNotificationHandler } from "./notification-handler";

// ============================================
// KONFIGURACJA GODZIN
// ============================================
const KEEP_ALIVE_TIME = "05:50"; // Keep-alive przed startem (sprawdzenie statusu)
const START_TIME = "06:00"; // Start timelapse
const STOP_TIME = "18:00"; // Stop timelapse
const DOWNLOAD_TIME = "18:05"; // Pobranie zdjęć z GoPro
const DELETE_TIME = "01:00"; // Wyczyszczenie plików z GoPro

// Monitorowanie statusu co 30 minut między pierwszą a ostatnią akcją
const STATUS_CHECK_INTERVAL_MINUTES = 30;

const notifier = getNotificationHandler();

const timeToCron = (time: string): string => {
  const [hours, minutes] = time.split(":").map(Number);
  return `${minutes} ${hours} * * *`;
};

const logWithTimestamp = (emoji: string, message: string) => {
  const timestamp = new Date().toLocaleString("pl-PL", {
    dateStyle: "short",
    timeStyle: "medium",
  });
  console.log(`[${timestamp}] ${emoji} ${message}`);
};

const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const isInMonitoringWindow = (): boolean => {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const firstActionMinutes = timeToMinutes(KEEP_ALIVE_TIME);
  const lastActionMinutes = timeToMinutes(DELETE_TIME);

  return (
    currentMinutes >= firstActionMinutes && currentMinutes <= lastActionMinutes
  );
};

// Funkcja sprawdzania statusu z wysyłaniem notyfikacji przy błędzie
const checkStatusWithNotification = () => {
  exec("npm run status", (error, stdout, stderr) => {
    if (error) {
      const errorMsg = `Błąd podczas sprawdzania statusu: ${error.message}`;
      logWithTimestamp("❌", errorMsg);

      // Wyślij notyfikacje EMAIL i SMS
      notifier.sendError("periodic-status-check", errorMsg);
      return;
    }
    if (stderr && stderr.includes("Error")) {
      const errorMsg = `stderr: ${stderr}`;
      logWithTimestamp("⚠️", errorMsg);

      // Wyślij notyfikacje EMAIL i SMS
      notifier.sendError("periodic-status-check", errorMsg);
      return;
    }
    logWithTimestamp("✅", "Status GoPro - OK");
    if (stdout) console.log(stdout);
  });
};

const cronHandler = () => {
  logWithTimestamp("🚀", "Cron Handler uruchomiony");
  logWithTimestamp("📅", "Harmonogram zadań:");
  console.log(`  • ${KEEP_ALIVE_TIME} - Status (keep-alive)`);
  console.log(`  • ${START_TIME} - Start timelapse`);
  console.log(`  • ${STOP_TIME} - Stop timelapse`);
  console.log(
    `  • ${DOWNLOAD_TIME} - Pobranie zdjęć → Upload do S3 (sekwencyjnie)`
  );
  console.log(`  • ${DELETE_TIME} - Wyczyszczenie plików`);
  console.log(
    `  • Co ${STATUS_CHECK_INTERVAL_MINUTES} min - Sprawdzanie statusu (${KEEP_ALIVE_TIME} - ${DELETE_TIME})`
  );
  console.log(`\n⚠️  Upload wykonuje się automatycznie po udanym download!`);
  console.log(
    `⚠️  Jeśli download się nie powiedzie, upload nie zostanie wykonany.\n`
  );

  // Monitorowanie statusu co 30 minut (tylko w oknie czasowym)
  cron.schedule(`*/${STATUS_CHECK_INTERVAL_MINUTES} * * * *`, () => {
    if (isInMonitoringWindow()) {
      logWithTimestamp(
        "🔍",
        `Okresowe sprawdzanie statusu (co ${STATUS_CHECK_INTERVAL_MINUTES} min)...`
      );
      checkStatusWithNotification();
    }
  });

  // Keep-alive status
  cron.schedule(timeToCron(KEEP_ALIVE_TIME), () => {
    logWithTimestamp("💓", "Keep-alive: Sprawdzam status GoPro...");
    checkStatusWithNotification();
  });

  // Start timelapse
  cron.schedule(timeToCron(START_TIME), () => {
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

  // Stop timelapse
  cron.schedule(timeToCron(STOP_TIME), () => {
    logWithTimestamp("⏹️", "Zatrzymuję timelapse...");
    exec("npm run stop-timelapse", (error, stdout, stderr) => {
      if (error) {
        logWithTimestamp(
          "❌",
          `Błąd podczas zatrzymywania timelapse: ${error.message}`
        );
        return;
      }
      if (stderr && stderr.includes("Error")) {
        logWithTimestamp("⚠️", `stderr: ${stderr}`);
        return;
      }
      logWithTimestamp("✅", "Timelapse zatrzymany pomyślnie");
      if (stdout) console.log(stdout);
    });
  });

  // Download files (wykonuje się o ustalonej godzinie)
  cron.schedule(timeToCron(DOWNLOAD_TIME), () => {
    logWithTimestamp("📥", "Pobieram zdjęcia z GoPro...");
    exec(
      "npm run download-files",
      (downloadError, downloadStdout, downloadStderr) => {
        if (downloadError) {
          logWithTimestamp(
            "❌",
            `Błąd podczas pobierania zdjęć: ${downloadError.message}`
          );
          logWithTimestamp("⚠️", "Upload i usuwanie plików zostały anulowane");
          return;
        }
        if (downloadStderr && downloadStderr.includes("Error")) {
          logWithTimestamp("⚠️", `stderr: ${downloadStderr}`);
          logWithTimestamp("⚠️", "Upload i usuwanie plików zostały anulowane");
          return;
        }
        logWithTimestamp("✅", "Zdjęcia pobrane pomyślnie");
        if (downloadStdout) console.log(downloadStdout);

        // Tylko jeśli download się powiódł - wykonaj upload z automatycznym usuwaniem lokalnych plików
        logWithTimestamp(
          "☁️",
          "Uploaduję pliki do S3 (z usuwaniem lokalnych po sukcesie)..."
        );
        exec(
          "npm run upload-files -- --delete-after-upload",
          (uploadError, uploadStdout, uploadStderr) => {
            if (uploadError) {
              logWithTimestamp(
                "❌",
                `Błąd podczas uploadu: ${uploadError.message}`
              );
              logWithTimestamp(
                "⚠️",
                "Pliki lokalne zostały zachowane (można spróbować ponownie)"
              );
              return;
            }
            if (uploadStderr && uploadStderr.includes("Error")) {
              logWithTimestamp("⚠️", `stderr: ${uploadStderr}`);
              logWithTimestamp(
                "⚠️",
                "Pliki lokalne zostały zachowane (można spróbować ponownie)"
              );
              return;
            }
            logWithTimestamp("✅", "Upload do S3 zakończony pomyślnie");
            logWithTimestamp("🗑️", "Pliki lokalne zostały usunięte");
            if (uploadStdout) console.log(uploadStdout);
          }
        );
      }
    );
  });

  // Delete files (wykonuje się o ustalonej godzinie, niezależnie od download/upload)
  cron.schedule(timeToCron(DELETE_TIME), () => {
    logWithTimestamp("🗑️", "Czyszczę pliki z GoPro...");
    exec("npm run delete-files -- --confirm", (error, stdout, stderr) => {
      if (error) {
        logWithTimestamp(
          "❌",
          `Błąd podczas czyszczenia plików: ${error.message}`
        );
        return;
      }
      if (stderr && stderr.includes("Error")) {
        logWithTimestamp("⚠️", `stderr: ${stderr}`);
        return;
      }
      logWithTimestamp("✅", "Pliki wyczyszczone pomyślnie");
      if (stdout) console.log(stdout);
    });
  });
};

cronHandler();
