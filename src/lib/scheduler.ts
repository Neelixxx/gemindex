import { withDbMutation } from "./db";
import { runWorkerTick } from "./jobs";

let schedulerStarted = false;

export function ensureSchedulerStarted(): boolean {
  if (schedulerStarted) {
    return false;
  }

  if (process.env.DISABLE_BACKGROUND_SCHEDULER === "1") {
    return false;
  }

  const intervalMs = Number(process.env.SCHEDULER_TICK_MS ?? "60000");
  const tickMs = Number.isFinite(intervalMs) && intervalMs > 5_000 ? intervalMs : 60_000;

  schedulerStarted = true;

  withDbMutation((db) => {
    db.sync.schedulerStartedAt = new Date().toISOString();
  }).catch(() => undefined);

  setInterval(() => {
    runWorkerTick({ source: "interval", maxTasks: 8 }).catch(() => undefined);
  }, tickMs);

  runWorkerTick({ source: "startup", maxTasks: 8 }).catch(() => undefined);

  return true;
}
