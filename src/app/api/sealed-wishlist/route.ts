import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { nextId, readDb, withDbMutation } from "@/lib/db";
import { featureErrorMessage, hasFeature } from "@/lib/entitlements";
import { enrichSealedWishlist } from "@/lib/selectors";

export const runtime = "nodejs";

const sealedWishlistSchema = z.object({
  setId: z.string(),
  productName: z.string().min(2),
  productType: z.enum([
    "BOOSTER_BOX",
    "ELITE_TRAINER_BOX",
    "COLLECTION_BOX",
    "TIN",
    "BLISTER",
    "OTHER",
  ]),
  targetPriceUsd: z.number().nonnegative().optional(),
  priority: z.number().int().min(1).max(5).default(2),
  notes: z.string().max(240).optional(),
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
  return NextResponse.json({ items: enrichSealedWishlist(db, user.id) });
}

export async function POST(request: NextRequest) {
  const json = await request.json();
  const parse = sealedWishlistSchema.safeParse(json);

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
    const existing = db.sealedWishlistItems.find(
      (item) =>
        item.userId === user.id &&
        item.setId === payload.setId &&
        item.productName.toLowerCase() === payload.productName.toLowerCase(),
    );

    if (existing) {
      existing.targetPriceUsd = payload.targetPriceUsd ?? existing.targetPriceUsd;
      existing.priority = payload.priority;
      existing.notes = payload.notes ?? existing.notes;
      return;
    }

    db.sealedWishlistItems.push({
      id: nextId("sealed_wishlist"),
      userId: user.id,
      setId: payload.setId,
      productName: payload.productName,
      productType: payload.productType,
      targetPriceUsd: payload.targetPriceUsd,
      priority: payload.priority,
      createdAt: new Date().toISOString(),
      notes: payload.notes,
    });
  });

  const db = await readDb(true);
  return NextResponse.json({ items: enrichSealedWishlist(db, user.id) }, { status: 201 });
}
