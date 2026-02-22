import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { nextId, readDb, withDbMutation } from "@/lib/db";
import { featureErrorMessage, hasFeature } from "@/lib/entitlements";
import { enrichWishlist } from "@/lib/selectors";

export const runtime = "nodejs";

const wishlistSchema = z.object({
  cardId: z.string(),
  targetPriceUsd: z.number().nonnegative().optional(),
  priority: z.number().int().min(1).max(5).default(3),
});

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasFeature(user, "PORTFOLIO_TRACKING")) {
    return NextResponse.json(
      { error: featureErrorMessage(user, "PORTFOLIO_TRACKING") },
      { status: 402 },
    );
  }
  const db = await readDb();
  return NextResponse.json({ items: enrichWishlist(db, user.id) });
}

export async function POST(request: NextRequest) {
  const json = await request.json();
  const parse = wishlistSchema.safeParse(json);

  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  const payload = parse.data;
  let user;
  try {
    user = await requireUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasFeature(user, "PORTFOLIO_TRACKING")) {
    return NextResponse.json(
      { error: featureErrorMessage(user, "PORTFOLIO_TRACKING") },
      { status: 402 },
    );
  }

  await withDbMutation((db) => {
    const existing = db.wishlistItems.find(
      (item) => item.userId === user.id && item.cardId === payload.cardId,
    );

    if (existing) {
      existing.targetPriceUsd = payload.targetPriceUsd;
      existing.priority = payload.priority;
      return;
    }

    db.wishlistItems.push({
      id: nextId("wishlist"),
      userId: user.id,
      cardId: payload.cardId,
      targetPriceUsd: payload.targetPriceUsd,
      priority: payload.priority,
      createdAt: new Date().toISOString(),
    });
  });

  const db = await readDb(true);
  return NextResponse.json({ items: enrichWishlist(db, user.id) }, { status: 201 });
}
