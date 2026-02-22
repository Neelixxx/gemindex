import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { featureErrorMessage, hasFeature } from "@/lib/entitlements";
import { enqueueSyncTask } from "@/lib/jobs";

export const runtime = "nodejs";

const schema = z.object({
  type: z.enum(["CATALOG_SYNC", "SALES_SYNC", "TCGPLAYER_DIRECT_SYNC"]),
  options: z
    .object({
      pageLimit: z.number().int().min(1).max(200).optional(),
      cardLimit: z.number().int().min(1).max(1000).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
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
  if (parse.data.type === "TCGPLAYER_DIRECT_SYNC" && !hasFeature(user, "DIRECT_TCGPLAYER_SYNC")) {
    return NextResponse.json(
      { error: featureErrorMessage(user, "DIRECT_TCGPLAYER_SYNC") },
      { status: 402 },
    );
  }

  const task = await enqueueSyncTask({
    type: parse.data.type,
    requestedBy: user.id,
    options: parse.data.options,
  });

  return NextResponse.json({ task }, { status: 201 });
}
