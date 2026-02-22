import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { nextId, readDb, withDbMutation } from "@/lib/db";
import { featureErrorMessage, hasFeature } from "@/lib/entitlements";
import { enrichSealed } from "@/lib/selectors";

export const runtime = "nodejs";

const sealedSchema = z.object({
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
  quantity: z.number().int().min(1).default(1),
  acquisitionPriceUsd: z.number().nonnegative().optional(),
  estimatedValueUsd: z.number().nonnegative().optional(),
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
  return NextResponse.json({ items: enrichSealed(db, user.id) });
}

export async function POST(request: NextRequest) {
  const json = await request.json();
  const parse = sealedSchema.safeParse(json);

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
    const existing = db.sealedInventoryItems.find(
      (item) =>
        item.userId === user.id &&
        item.setId === payload.setId &&
        item.productName.toLowerCase() === payload.productName.toLowerCase(),
    );

    if (existing) {
      existing.quantity += payload.quantity;
      existing.acquisitionPriceUsd = payload.acquisitionPriceUsd ?? existing.acquisitionPriceUsd;
      existing.estimatedValueUsd = payload.estimatedValueUsd ?? existing.estimatedValueUsd;
      existing.notes = payload.notes ?? existing.notes;
      return;
    }

    db.sealedInventoryItems.push({
      id: nextId("sealed"),
      userId: user.id,
      setId: payload.setId,
      productName: payload.productName,
      productType: payload.productType,
      quantity: payload.quantity,
      acquisitionPriceUsd: payload.acquisitionPriceUsd,
      estimatedValueUsd: payload.estimatedValueUsd,
      acquiredAt: new Date().toISOString(),
      notes: payload.notes,
    });
  });

  const db = await readDb(true);
  return NextResponse.json({ items: enrichSealed(db, user.id) }, { status: 201 });
}
