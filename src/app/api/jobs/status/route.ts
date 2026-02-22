import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { featureErrorMessage, hasFeature } from "@/lib/entitlements";
import { ensureSchedulerStarted } from "@/lib/scheduler";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAdmin(request);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasFeature(user, "LIVE_SYNC_QUEUE")) {
    return NextResponse.json(
      { error: featureErrorMessage(user, "LIVE_SYNC_QUEUE") },
      { status: 402 },
    );
  }

  ensureSchedulerStarted();

  const db = await readDb();
  return NextResponse.json({
    sync: db.sync,
    jobs: db.syncJobs,
    tasks: db.syncTasks.slice(-100).reverse(),
  });
}
