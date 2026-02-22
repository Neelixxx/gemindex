import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { enqueueSyncTask, runWorkerTick } from "@/lib/jobs";
import { logger } from "@/lib/logger";
import { requestIdFromRequest } from "@/lib/observability";
import { featureErrorMessage, hasFeature } from "@/lib/entitlements";

export const runtime = "nodejs";

const schema = z.object({
  pageLimit: z.number().int().min(1).max(200).optional(),
  runNow: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const requestId = requestIdFromRequest(request);
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

  const json = await request.json().catch(() => ({}));
  const parse = schema.safeParse(json);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  const task = await enqueueSyncTask({
    type: "CATALOG_SYNC",
    requestedBy: user.id,
    options: { pageLimit: parse.data.pageLimit },
  });

  if (parse.data.runNow) {
    const worker = await runWorkerTick({ source: "manual" });
    logger.info({ requestId, taskId: task.id, runNow: true, worker }, "catalog sync enqueued");
    return NextResponse.json({ queued: task, worker }, { status: 202 });
  }

  logger.info({ requestId, taskId: task.id, runNow: false }, "catalog sync enqueued");
  return NextResponse.json({ queued: task }, { status: 202 });
}
