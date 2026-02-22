import { type ConnectionOptions, Queue, Worker } from "bullmq";

const QUEUE_NAME = "gemindex-sync";
const WORKER_TICK_JOB_NAME = "worker-tick";

type QueueJob = {
  source?: string;
};
type QueueJobName = typeof WORKER_TICK_JOB_NAME;
type SyncQueue = Queue<
  QueueJob,
  void,
  QueueJobName,
  QueueJob,
  void,
  QueueJobName
>;

let queue: SyncQueue | null = null;

function redisUrl(): string | null {
  return process.env.REDIS_URL ?? null;
}

export function queueEnabled(): boolean {
  return Boolean(redisUrl());
}

function queueConnection(): ConnectionOptions {
  const url = redisUrl();
  if (!url) {
    throw new Error("REDIS_URL is not configured.");
  }

  return {
    url,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
}

export function syncQueue(): SyncQueue {
  if (!queue) {
    queue = new Queue<QueueJob, void, QueueJobName, QueueJob, void, QueueJobName>(
      QUEUE_NAME,
      {
      connection: queueConnection(),
      defaultJobOptions: {
        attempts: 3,
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    },
    );
  }

  return queue;
}

export async function enqueueWorkerTickJob(source = "api"): Promise<void> {
  if (!queueEnabled()) {
    return;
  }

  await syncQueue().add(
    WORKER_TICK_JOB_NAME,
    { source },
    {
      jobId: `tick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      priority: 2,
    },
  );
}

export function startQueueWorker(
  handler: (payload: QueueJob) => Promise<void>,
): Worker<QueueJob, void, QueueJobName> | null {
  if (!queueEnabled()) {
    return null;
  }

  const worker = new Worker<QueueJob, void, QueueJobName>(
    QUEUE_NAME,
    async (job) => {
      await handler(job.data ?? {});
    },
    {
      connection: queueConnection(),
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? "2"),
    },
  );

  return worker;
}
