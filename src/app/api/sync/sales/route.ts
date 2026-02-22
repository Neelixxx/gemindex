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
  cardLimit: z.number().int().min(1).max(1000).optional(),
  runNow: z.boolean().optional(),
  provider: z.enum(["POKEMONTCG", "TCGPLAYER_DIRECT"]).optional(),
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
  if (parse.data.provider === "TCGPLAYER_DIRECT" && !hasFeature(user, "DIRECT_TCGPLAYER_SYNC")) {
    return NextResponse.json(
      { error: featureErrorMessage(user, "DIRECT_TCGPLAYER_SYNC") },
      { status: 402 },
    );
  }

  const task = await enqueueSyncTask({
    type: parse.data.provider === "TCGPLAYER_DIRECT" ? "TCGPLAYER_DIRECT_SYNC" : "SALES_SYNC",
    requestedBy: user.id,
    options: {
      pageLimit: parse.data.pageLimit,
      cardLimit: parse.data.cardLimit,
    },
  });

  if (parse.data.runNow) {
    const worker = await runWorkerTick({ source: "manual" });
    logger.info(
      {
        requestId,
        taskId: task.id,
        provider: parse.data.provider ?? "POKEMONTCG",
        runNow: true,
        worker,
      },
      "sales sync enqueued",
    );
    return NextResponse.json({ queued: task, worker }, { status: 202 });
  }

  logger.info(
    {
      requestId,
      taskId: task.id,
      provider: parse.data.provider ?? "POKEMONTCG",
      runNow: false,
    },
    "sales sync enqueued",
  );
  return NextResponse.json({ queued: task }, { status: 202 });
}
