import "dotenv/config";

import { runWorkerTick } from "../lib/jobs";
import { logger } from "../lib/logger";
import { queueEnabled, startQueueWorker } from "../lib/queue";

const intervalMs = Number(process.env.WORKER_TICK_MS ?? "30000");
const safeIntervalMs = Number.isFinite(intervalMs) && intervalMs > 5000 ? intervalMs : 30000;

async function runTick(source: string): Promise<void> {
  const result = await runWorkerTick({ source, maxTasks: 20 });
  logger.info({ result }, "worker tick completed");
}

async function bootstrap(): Promise<void> {
  logger.info({ queue: queueEnabled() }, "starting worker runtime");

  if (queueEnabled()) {
    const worker = startQueueWorker(async (payload) => {
      await runTick(payload.source ?? "queue");
    });

    worker?.on("failed", (job, error) => {
      logger.error({ id: job?.id, error: error.message }, "queue job failed");
    });

    worker?.on("error", (error) => {
      logger.error({ error: error.message }, "queue worker error");
    });
  }

  await runTick("startup");

  setInterval(() => {
    runTick("interval").catch((error) => {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, "interval tick failed");
    });
  }, safeIntervalMs);
}

bootstrap().catch((error) => {
  logger.error({ error: error instanceof Error ? error.message : String(error) }, "worker startup failed");
  process.exit(1);
});
