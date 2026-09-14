import cron from "node-cron";
import { dueReminders, runReminderNow } from "../services/reminderService.js";
import { log } from "../db/database.js";

let running = false;

export async function tick() {
  if (running) return;
  running = true;
  try {
    const due = dueReminders();
    for (const reminder of due) {
      try {
        await runReminderNow(reminder);
      } catch (error) {
        log(`Scheduler error on reminder ${reminder.id}: ${error.message}`, {
          level: "ERROR",
          source: "SCHEDULER",
        });
      }
    }
  } catch (error) {
    log(`Scheduler tick failed: ${error.message}`, { level: "ERROR", source: "SCHEDULER" });
  } finally {
    running = false;
  }
}

export function startScheduler() {
  cron.schedule("* * * * *", () => {
    void tick();
  });
  // Run once at boot so reminders that came due while the server was off are handled.
  void tick();
  console.log("[scheduler] reminder scheduler running (every minute)");
}
