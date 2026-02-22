import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { nextId, readDb, withDbMutation } from "@/lib/db";
import { featureErrorMessage, hasFeature } from "@/lib/entitlements";
import { enrichCollection } from "@/lib/selectors";

export const runtime = "nodejs";

const collectionSchema = z.object({
  cardId: z.string(),
  ownershipType: z.enum(["RAW", "GRADED"]),
  grader: z.enum(["PSA", "TAG"]).optional(),
  grade: z.number().int().min(1).max(10).optional(),
  quantity: z.number().int().min(1).default(1),
  acquisitionPriceUsd: z.number().nonnegative().optional(),
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
  return NextResponse.json({ items: enrichCollection(db, user.id) });
}

export async function POST(request: NextRequest) {
  const json = await request.json();
  const parse = collectionSchema.safeParse(json);

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
    const existing = db.collectionItems.find(
      (item) =>
        item.userId === user.id &&
        item.cardId === payload.cardId &&
        item.ownershipType === payload.ownershipType &&
        (item.grader ?? null) === (payload.grader ?? null) &&
        (item.grade ?? null) === (payload.grade ?? null),
    );

    if (existing) {
      existing.quantity += payload.quantity;
      if (payload.acquisitionPriceUsd !== undefined) {
        existing.acquisitionPriceUsd = payload.acquisitionPriceUsd;
      }
      if (payload.notes) {
        existing.notes = payload.notes;
      }
      return;
    }

    db.collectionItems.push({
      id: nextId("collection"),
      userId: user.id,
      cardId: payload.cardId,
      ownershipType: payload.ownershipType,
      grader: payload.grader,
      grade: payload.grade,
      quantity: payload.quantity,
      acquisitionPriceUsd: payload.acquisitionPriceUsd,
      acquiredAt: new Date().toISOString(),
      notes: payload.notes,
    });
  });

  const db = await readDb(true);
  return NextResponse.json({ items: enrichCollection(db, user.id) }, { status: 201 });
}
