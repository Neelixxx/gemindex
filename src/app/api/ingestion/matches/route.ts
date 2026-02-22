import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { readDb, withDbMutation } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  cardId: z.string(),
  productId: z.number().int().positive(),
  groupId: z.number().int().positive().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await readDb();
  const setById = new Map(db.sets.map((set) => [set.id, set]));

  const items = db.cards
    .filter((card) => card.tcgplayerMatchConfidence !== undefined)
    .map((card) => ({
      cardId: card.id,
      cardName: `${card.name} ${card.cardNumber}`,
      setName: setById.get(card.setId)?.name ?? "Unknown",
      productId: card.tcgplayerProductId,
      groupId: card.tcgplayerGroupId,
      confidence: card.tcgplayerMatchConfidence,
      method: card.tcgplayerMatchMethod,
      matchedAt: card.tcgplayerMatchedAt,
    }))
    .sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0));

  return NextResponse.json({
    lowConfidence: items.filter((item) => (item.confidence ?? 0) < 0.55).slice(0, 100),
    recent: items.slice(-100).reverse(),
  });
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => ({}));
  const parse = schema.safeParse(json);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  const payload = parse.data;

  try {
    await withDbMutation((db) => {
      const card = db.cards.find((entry) => entry.id === payload.cardId);
      if (!card) {
        throw new Error("CARD_NOT_FOUND");
      }

      card.tcgplayerProductId = payload.productId;
      card.tcgplayerGroupId = payload.groupId ?? card.tcgplayerGroupId;
      card.tcgplayerMatchConfidence = payload.confidence ?? 1;
      card.tcgplayerMatchMethod = "MANUAL";
      card.tcgplayerMatchedAt = new Date().toISOString();
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CARD_NOT_FOUND") {
      return NextResponse.json({ error: "Card not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to update override." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
