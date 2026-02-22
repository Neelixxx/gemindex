import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { nextId, readDb, withDbMutation } from "@/lib/db";
import { featureErrorMessage, hasFeature } from "@/lib/entitlements";
import { findCardFromScan } from "@/lib/scan";
import { cardWithSet, enrichCollection, enrichWishlist } from "@/lib/selectors";

export const runtime = "nodejs";

const scanSchema = z.object({
  scannedText: z.string().min(2),
  destination: z.enum(["COLLECTION", "WISHLIST"]),
  quantity: z.number().int().min(1).default(1),
  ownershipType: z.enum(["RAW", "GRADED"]).default("RAW"),
  grader: z.enum(["PSA", "TAG"]).optional(),
  grade: z.number().int().min(1).max(10).optional(),
  targetPriceUsd: z.number().nonnegative().optional(),
});

export async function POST(request: NextRequest) {
  const json = await request.json();
  const parse = scanSchema.safeParse(json);

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
  if (!hasFeature(user, "CARD_SCANNER_TEXT")) {
    return NextResponse.json(
      { error: featureErrorMessage(user, "CARD_SCANNER_TEXT") },
      { status: 402 },
    );
  }
  const snapshot = await readDb();
  const match = findCardFromScan(snapshot, payload.scannedText);

  await withDbMutation((db) => {
    db.scanEvents.push({
      id: nextId("scan"),
      userId: user.id,
      cardId: match?.card.id,
      destination: payload.destination,
      scannedText: payload.scannedText,
      createdAt: new Date().toISOString(),
    });

    if (!match) {
      return;
    }

    if (payload.destination === "COLLECTION") {
      const existing = db.collectionItems.find(
        (item) =>
          item.userId === user.id &&
          item.cardId === match.card.id &&
          item.ownershipType === payload.ownershipType &&
          (item.grader ?? null) === (payload.grader ?? null) &&
          (item.grade ?? null) === (payload.grade ?? null),
      );

      if (existing) {
        existing.quantity += payload.quantity;
      } else {
        db.collectionItems.push({
          id: nextId("collection"),
          userId: user.id,
          cardId: match.card.id,
          ownershipType: payload.ownershipType,
          grader: payload.ownershipType === "GRADED" ? payload.grader : undefined,
          grade: payload.ownershipType === "GRADED" ? payload.grade : undefined,
          quantity: payload.quantity,
          acquiredAt: new Date().toISOString(),
          notes: "Added by scanner",
        });
      }
      return;
    }

    const wishlist = db.wishlistItems.find(
      (item) => item.userId === user.id && item.cardId === match.card.id,
    );

    if (wishlist) {
      wishlist.targetPriceUsd = payload.targetPriceUsd ?? wishlist.targetPriceUsd;
      wishlist.priority = Math.min(5, Math.max(1, wishlist.priority - 1));
    } else {
      db.wishlistItems.push({
        id: nextId("wishlist"),
        userId: user.id,
        cardId: match.card.id,
        targetPriceUsd: payload.targetPriceUsd,
        priority: 2,
        createdAt: new Date().toISOString(),
      });
    }
  });

  const db = await readDb(true);

  return NextResponse.json({
    match: match
      ? {
          ...match,
          card: cardWithSet(db, match.card.id),
        }
      : null,
    collection: payload.destination === "COLLECTION" ? enrichCollection(db, user.id) : undefined,
    wishlist: payload.destination === "WISHLIST" ? enrichWishlist(db, user.id) : undefined,
  });
}
