import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { cardMetrics, setMetrics } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { nextId, readDb, withDbMutation } from "@/lib/db";
import { featureErrorMessage, hasFeature } from "@/lib/entitlements";
import {
  extractBarcodeLikeTokens,
  findCardFromScan,
  findSealedDetailsFromScan,
  findSetFromScan,
  findSlabDetailsFromScan,
} from "@/lib/scan";
import { cardWithSet, enrichCollection, enrichSealed, enrichSealedWishlist, enrichWishlist } from "@/lib/selectors";

export const runtime = "nodejs";

const scanSchema = z.object({
  scannedText: z.string().min(2),
  destination: z.enum(["COLLECTION", "WISHLIST", "PRICE_CHECK"]),
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
  if (payload.destination !== "PRICE_CHECK" && !hasFeature(user, "PORTFOLIO_TRACKING")) {
    return NextResponse.json(
      { error: featureErrorMessage(user, "PORTFOLIO_TRACKING") },
      { status: 402 },
    );
  }
  const snapshot = await readDb();
  const match = findCardFromScan(snapshot, payload.scannedText);
  const barcodeValue = extractBarcodeLikeTokens(payload.scannedText)[0];
  const setMatchByText = findSetFromScan(snapshot, payload.scannedText);
  const slab = findSlabDetailsFromScan(payload.scannedText);
  const sealed = findSealedDetailsFromScan(payload.scannedText, barcodeValue);
  const resolvedSet =
    (setMatchByText
      ? snapshot.sets.find((entry) => entry.id === setMatchByText.id)
      : undefined) ??
    (sealed?.setCode ? snapshot.sets.find((entry) => entry.code === sealed.setCode) : undefined);
  const setMatch = setMatchByText
    ? setMatchByText
    : resolvedSet
      ? {
          id: resolvedSet.id,
          code: resolvedSet.code,
          name: resolvedSet.name,
          confidence: sealed?.confidence ?? 0.7,
          reason: sealed?.barcode ? `Matched via barcode ${sealed.barcode}` : "Matched via sealed label template",
        }
      : null;
  const isSealed = Boolean(sealed && setMatch);
  const isGraded = Boolean(slab.grader || slab.grade || payload.ownershipType === "GRADED");

  await withDbMutation((db) => {
    db.scanEvents.push({
      id: nextId("scan"),
      userId: user.id,
      cardId: match?.card.id,
      destination: payload.destination,
      scannedText: payload.scannedText,
      createdAt: new Date().toISOString(),
    });

    if (payload.destination === "PRICE_CHECK") {
      return;
    }

    if (isSealed && payload.destination === "COLLECTION" && resolvedSet && sealed) {
      const existing = db.sealedInventoryItems.find(
        (item) =>
          item.userId === user.id &&
          item.setId === resolvedSet.id &&
          item.productName.toLowerCase() === sealed.productName.toLowerCase(),
      );
      if (existing) {
        existing.quantity += payload.quantity;
      } else {
        db.sealedInventoryItems.push({
          id: nextId("sealed"),
          userId: user.id,
          setId: resolvedSet.id,
          productName: sealed.productName,
          productType: sealed.productType,
          quantity: payload.quantity,
          acquiredAt: new Date().toISOString(),
          notes: "Added by scanner",
        });
      }
      return;
    }

    if (isSealed && payload.destination === "WISHLIST" && resolvedSet && sealed) {
      const existing = db.sealedWishlistItems.find(
        (item) =>
          item.userId === user.id &&
          item.setId === resolvedSet.id &&
          item.productName.toLowerCase() === sealed.productName.toLowerCase(),
      );
      if (existing) {
        existing.targetPriceUsd = payload.targetPriceUsd ?? existing.targetPriceUsd;
        existing.priority = Math.min(5, Math.max(1, existing.priority - 1));
      } else {
        db.sealedWishlistItems.push({
          id: nextId("sealed_wishlist"),
          userId: user.id,
          setId: resolvedSet.id,
          productName: sealed.productName,
          productType: sealed.productType,
          targetPriceUsd: payload.targetPriceUsd,
          priority: 2,
          createdAt: new Date().toISOString(),
          notes: "Added by scanner",
        });
      }
      return;
    }

    if (!match) {
      return;
    }

    if (payload.destination === "COLLECTION") {
      const ownershipType = isGraded ? "GRADED" : "RAW";
      const grader = ownershipType === "GRADED" ? (payload.grader ?? slab.grader) : undefined;
      const grade = ownershipType === "GRADED" ? (payload.grade ?? slab.grade) : undefined;
      const existing = db.collectionItems.find(
        (item) =>
          item.userId === user.id &&
          item.cardId === match.card.id &&
          item.ownershipType === ownershipType &&
          (item.grader ?? null) === (grader ?? null) &&
          (item.grade ?? null) === (grade ?? null),
      );

      if (existing) {
        existing.quantity += payload.quantity;
      } else {
        db.collectionItems.push({
          id: nextId("collection"),
          userId: user.id,
          cardId: match.card.id,
          ownershipType,
          grader,
          grade,
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
  const cardMetric = match ? cardMetrics(db).find((entry) => entry.cardId === match.card.id) : undefined;
  const setMetric = resolvedSet ? setMetrics(db).find((entry) => entry.setId === resolvedSet.id) : undefined;

  return NextResponse.json({
    itemKind: isSealed ? "SEALED_PRODUCT" : isGraded && match ? "GRADED_SLAB" : match ? "RAW_CARD" : "UNKNOWN",
    barcode: barcodeValue ?? null,
    slab,
    sealed,
    match: match
      ? {
          ...match,
          card: cardWithSet(db, match.card.id),
        }
      : null,
    setMatch: setMatch
      ? {
          id: setMatch.id,
          code: setMatch.code,
          name: setMatch.name,
          confidence: setMatch.confidence,
          reason: setMatch.reason,
        }
      : null,
    priceCheck: {
      card: cardMetric
        ? {
            raw: cardMetric.rawPrice,
            psa10: cardMetric.psa10Price,
            tag10: cardMetric.tag10Price,
            gemRateBlended: cardMetric.gemRateBlended,
          }
        : null,
      set: setMetric
        ? {
            setId: setMetric.setId,
            name: setMetric.name,
            totalSetValue: setMetric.totalSetValue,
          }
        : null,
    },
    collection: payload.destination === "COLLECTION" ? enrichCollection(db, user.id) : undefined,
    wishlist: payload.destination === "WISHLIST" ? enrichWishlist(db, user.id) : undefined,
    sealedCollection: payload.destination === "COLLECTION" ? enrichSealed(db, user.id) : undefined,
    sealedWishlist: payload.destination === "WISHLIST" ? enrichSealedWishlist(db, user.id) : undefined,
  });
}
