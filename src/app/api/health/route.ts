import { NextResponse } from "next/server";

import { readDb, storageMode } from "@/lib/db";
import { queueEnabled } from "@/lib/queue";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await readDb();

    return NextResponse.json({
      status: "ok",
      now: new Date().toISOString(),
      storage: storageMode(),
      queue: {
        enabled: queueEnabled(),
      },
      totals: {
        sets: db.sets.length,
        cards: db.cards.length,
        sales: db.sales.length,
        users: db.users.length,
        pendingTasks: db.syncTasks.filter((entry) => entry.status === "PENDING").length,
      },
      worker: {
        schedulerStartedAt: db.sync.schedulerStartedAt ?? null,
        lastWorkerRunAt: db.sync.lastWorkerRunAt ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Health check failed",
      },
      { status: 503 },
    );
  }
}
