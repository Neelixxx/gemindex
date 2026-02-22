import { cleanupAuthTokens } from "./account-recovery";
import { nextId, readDb, withDbMutation } from "./db";
import { enqueueWorkerTickJob } from "./queue";
import { runSyncJob } from "./sync";
import type { SyncJobRecord, SyncJobType, SyncTaskRecord } from "./types";

let workerRunning = false;

function plusMinutes(base: Date, minutes: number): string {
  return new Date(base.getTime() + minutes * 60_000).toISOString();
}

function summarize(result: Record<string, number>): string {
  return Object.entries(result)
    .map(([key, value]) => `${key}:${value}`)
    .join(" | ");
}

export async function enqueueSyncTask(params: {
  type: SyncJobType;
  requestedBy?: string;
  options?: { pageLimit?: number; cardLimit?: number };
}): Promise<SyncTaskRecord> {
  let created: SyncTaskRecord | null = null;

  await withDbMutation((db) => {
    created = {
      id: nextId("task"),
      type: params.type,
      status: "PENDING",
      requestedBy: params.requestedBy,
      options: params.options,
      createdAt: new Date().toISOString(),
    };

    db.syncTasks.push(created);
    db.syncTasks = db.syncTasks.slice(-500);
  });

  if (!created) {
    throw new Error("Failed to enqueue task.");
  }

  await enqueueWorkerTickJob("enqueue-task");

  return created;
}

async function startTask(task: SyncTaskRecord): Promise<void> {
  await withDbMutation((db) => {
    const row = db.syncTasks.find((entry) => entry.id === task.id);
    if (!row || row.status !== "PENDING") {
      return;
    }
    row.status = "RUNNING";
    row.startedAt = new Date().toISOString();
  });
}

async function finishTask(taskId: string, result: Record<string, number>): Promise<void> {
  await withDbMutation((db) => {
    const row = db.syncTasks.find((entry) => entry.id === taskId);
    if (!row) {
      return;
    }
    row.status = "COMPLETED";
    row.finishedAt = new Date().toISOString();
    row.resultSummary = summarize(result);
  });
}

async function failTask(taskId: string, error: string): Promise<void> {
  await withDbMutation((db) => {
    const row = db.syncTasks.find((entry) => entry.id === taskId);
    if (!row) {
      return;
    }
    row.status = "FAILED";
    row.finishedAt = new Date().toISOString();
    row.error = error;
    db.sync.lastError = `${new Date().toISOString()} ${error}`;
  });
}

async function runScheduledJob(job: SyncJobRecord): Promise<void> {
  await withDbMutation((db) => {
    const row = db.syncJobs.find((entry) => entry.id === job.id);
    if (!row || !row.enabled || row.running) {
      return;
    }
    row.running = true;
    row.lastRunAt = new Date().toISOString();
  });

  try {
    const result = await runSyncJob(job.type, job.options);

    await withDbMutation((db) => {
      const row = db.syncJobs.find((entry) => entry.id === job.id);
      if (!row) {
        return;
      }

      const now = new Date();
      row.running = false;
      row.lastStatus = "SUCCESS";
      row.lastSuccessAt = now.toISOString();
      row.lastError = undefined;
      row.nextRunAt = plusMinutes(now, Math.max(1, row.intervalMinutes));

      db.sync.lastError = undefined;
      db.syncTasks.push({
        id: nextId("task"),
        type: job.type,
        status: "COMPLETED",
        requestedBy: "scheduler",
        options: job.options,
        createdAt: row.lastRunAt ?? now.toISOString(),
        startedAt: row.lastRunAt ?? now.toISOString(),
        finishedAt: now.toISOString(),
        resultSummary: summarize(result),
      });
      db.syncTasks = db.syncTasks.slice(-500);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled job failed";

    await withDbMutation((db) => {
      const row = db.syncJobs.find((entry) => entry.id === job.id);
      if (!row) {
        return;
      }

      const now = new Date();
      row.running = false;
      row.lastStatus = "FAILED";
      row.lastError = message;
      row.nextRunAt = plusMinutes(now, Math.max(5, Math.ceil(row.intervalMinutes / 2)));
      db.sync.lastError = `${now.toISOString()} ${message}`;
    });
  }
}

export async function runWorkerTick(options?: { source?: string; maxTasks?: number }): Promise<{
  skipped: boolean;
  source: string;
  tasksProcessed: number;
  jobsProcessed: number;
}> {
  if (workerRunning) {
    return {
      skipped: true,
      source: options?.source ?? "manual",
      tasksProcessed: 0,
      jobsProcessed: 0,
    };
  }

  workerRunning = true;
  const maxTasks = options?.maxTasks ?? 10;

  try {
    await cleanupAuthTokens();

    await withDbMutation((db) => {
      db.sync.lastWorkerRunAt = new Date().toISOString();
    });

    let tasksProcessed = 0;
    let jobsProcessed = 0;

    const dbForTasks = await readDb(true);
    const pendingTasks = dbForTasks.syncTasks
      .filter((task) => task.status === "PENDING")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, maxTasks);

    for (const task of pendingTasks) {
      await startTask(task);
      try {
        const result = await runSyncJob(task.type, task.options);
        await finishTask(task.id, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Task failed";
        await failTask(task.id, message);
      }
      tasksProcessed += 1;
    }

    const dbForJobs = await readDb(true);
    const now = new Date().toISOString();
    const dueJobs = dbForJobs.syncJobs
      .filter((job) => job.enabled && !job.running && job.nextRunAt <= now)
      .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt));

    for (const job of dueJobs) {
      await runScheduledJob(job);
      jobsProcessed += 1;
    }

    return {
      skipped: false,
      source: options?.source ?? "manual",
      tasksProcessed,
      jobsProcessed,
    };
  } finally {
    workerRunning = false;
  }
}
