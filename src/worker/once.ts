import "dotenv/config";

import { runWorkerTick } from "../lib/jobs";
import { logger } from "../lib/logger";

runWorkerTick({ source: "worker-once", maxTasks: 50 })
  .then((result) => {
    logger.info({ result }, "worker-once completed");
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "worker-once failed");
    process.exit(1);
  });
