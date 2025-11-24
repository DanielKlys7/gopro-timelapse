import cron from "node-cron";
import { exec } from "child_process";

console.log("🚀 Uruchamiam test cron-handlera...");
console.log("⏰ Zadania będą wykonywane co minutę przez 5 minut\n");

let taskCount = 0;
const startTime = new Date();

// Helper do wyświetlania czasu
const logTime = () => {
  const elapsed = Math.floor(
    (new Date().getTime() - startTime.getTime()) / 1000
  );
  return `[${elapsed}s]`;
};

// Test 1: Start timelapse (co 1 minutę)
console.log("📋 Zadanie 1: Start timelapse - zaplanowane co 1 minutę");
cron.schedule("* * * * *", () => {
  taskCount++;
  console.log(
    `\n${logTime()} ⚡ Wykonuję: start-timelapse (zadanie #${taskCount})`
  );
  exec("npm run start-timelapse", (error, stdout, stderr) => {
    if (error) {
      console.error(
        `${logTime()} ❌ Error starting timelapse: ${error.message}`
      );
      return;
    }
    if (stderr) {
      console.error(`${logTime()} ⚠️  stderr: ${stderr}`);
    }
    console.log(`${logTime()} ✅ stdout: ${stdout}`);
  });
});

// Test 2: Status (co 2 minuty)
console.log("📋 Zadanie 2: Status - zaplanowane co 2 minuty");
cron.schedule("*/2 * * * *", () => {
  taskCount++;
  console.log(`\n${logTime()} ⚡ Wykonuję: status (zadanie #${taskCount})`);
  exec("npm run status", (error, stdout, stderr) => {
    if (error) {
      console.error(`${logTime()} ❌ Error checking status: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`${logTime()} ⚠️  stderr: ${stderr}`);
    }
    console.log(`${logTime()} ✅ stdout: ${stdout}`);
  });
});

// Test 3: List files (co 3 minuty)
console.log("📋 Zadanie 3: List files - zaplanowane co 3 minuty");
cron.schedule("*/3 * * * *", () => {
  taskCount++;
  console.log(`\n${logTime()} ⚡ Wykonuję: list-files (zadanie #${taskCount})`);
  exec("npm run list-files", (error, stdout, stderr) => {
    if (error) {
      console.error(`${logTime()} ❌ Error listing files: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`${logTime()} ⚠️  stderr: ${stderr}`);
    }
    console.log(`${logTime()} ✅ stdout: ${stdout}`);
  });
});

console.log("\n⏳ Czekam na wykonanie zadań...");
console.log("🛑 Naciśnij Ctrl+C aby zatrzymać test\n");

// Automatyczne zakończenie po 5 minutach
setTimeout(() => {
  console.log(`\n\n${logTime()} ⏹️  Test zakończony po 5 minutach`);
  console.log(`📊 Łączna liczba wykonanych zadań: ${taskCount}`);
  process.exit(0);
}, 5 * 60 * 1000);
