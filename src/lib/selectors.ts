import type {
  CardRecord,
  CollectionItemRecord,
  GemIndexDatabase,
  SealedInventoryRecord,
  WishlistItemRecord,
} from "./types";

export interface CardWithSet extends CardRecord {
  setCode: string;
  setName: string;
}

export function cardWithSet(db: GemIndexDatabase, cardId: string): CardWithSet | null {
  const card = db.cards.find((entry) => entry.id === cardId);
  if (!card) {
    return null;
  }

  const set = db.sets.find((entry) => entry.id === card.setId);
  if (!set) {
    return null;
  }

  return {
    ...card,
    setCode: set.code,
    setName: set.name,
  };
}

export function enrichCollection(db: GemIndexDatabase, userId: string): Array<CollectionItemRecord & { card: CardWithSet | null }> {
  return db.collectionItems
    .filter((item) => item.userId === userId)
    .map((item) => ({
      ...item,
      card: cardWithSet(db, item.cardId),
    }));
}

export function enrichWishlist(db: GemIndexDatabase, userId: string): Array<WishlistItemRecord & { card: CardWithSet | null }> {
  return db.wishlistItems
    .filter((item) => item.userId === userId)
    .map((item) => ({
      ...item,
      card: cardWithSet(db, item.cardId),
    }));
}

export function enrichSealed(db: GemIndexDatabase, userId: string): Array<SealedInventoryRecord & { setCode: string; setName: string }> {
  return db.sealedInventoryItems
    .filter((item) => item.userId === userId)
    .map((item) => {
      const set = db.sets.find((entry) => entry.id === item.setId);
      return {
        ...item,
        setCode: set?.code ?? "unknown",
        setName: set?.name ?? "Unknown Set",
      };
    });
}
