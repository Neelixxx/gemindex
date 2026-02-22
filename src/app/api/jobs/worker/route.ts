import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { featureErrorMessage, hasFeature } from "@/lib/entitlements";
import { runWorkerTick } from "@/lib/jobs";
import { logger } from "@/lib/logger";
import { requestIdFromRequest } from "@/lib/observability";

export const runtime = "nodejs";

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const header = request.headers.get("x-cron-secret");
  const query = request.nextUrl.searchParams.get("token");
  return header === secret || query === secret;
}

export async function POST(request: NextRequest) {
  const requestId = requestIdFromRequest(request);
  const cronAuthorized = isCronAuthorized(request);
  let user: Awaited<ReturnType<typeof requireAdmin>> | null = null;

  if (!cronAuthorized) {
    try {
      user = await requireAdmin(request);
    } catch (error) {
      if (error instanceof Error && error.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Admin access required." }, { status: 403 });
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user || !hasFeature(user, "LIVE_SYNC_QUEUE")) {
      return NextResponse.json(
        { error: user ? featureErrorMessage(user, "LIVE_SYNC_QUEUE") : "Upgrade required." },
        { status: 402 },
      );
    }
  }

  const source = cronAuthorized ? "cron" : "manual";
  const result = await runWorkerTick({ source });
  logger.info({ requestId, source, result }, "worker tick triggered");
  return NextResponse.json(result);
}
