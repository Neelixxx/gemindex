import type { CardRecord, GemIndexDatabase } from "./types";

export interface ScanMatch {
  card: CardRecord;
  confidence: number;
  reason: string;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function findCardFromScan(db: GemIndexDatabase, scannedText: string): ScanMatch | null {
  const clean = normalize(scannedText);
  if (!clean) {
    return null;
  }

  const numberMatch = scannedText.match(/([a-z]{0,2}\d+[a-z]{0,2}|\d+[a-z]{0,2})\s*\//i) ??
    scannedText.match(/\b([a-z]{0,2}\d+[a-z]{0,2})\b/i);
  const parsedNumber = numberMatch?.[1]?.toUpperCase();

  const setMatch = db.sets.find((set) => {
    const code = set.code.toLowerCase();
    const name = set.name.toLowerCase();
    return clean.includes(code) || clean.includes(name);
  });

  const setScopedCards = setMatch
    ? db.cards.filter((card) => card.setId === setMatch.id)
    : db.cards;

  if (parsedNumber) {
    const exactByNumber = setScopedCards.find(
      (card) => card.cardNumber.toUpperCase() === parsedNumber,
    );

    if (exactByNumber) {
      return {
        card: exactByNumber,
        confidence: setMatch ? 0.95 : 0.8,
        reason: `Matched card number ${parsedNumber}`,
      };
    }
  }

  const nameRanked = setScopedCards
    .map((card) => {
      const cardName = normalize(card.name);
      if (clean.includes(cardName)) {
        return { card, confidence: 0.9, reason: `Matched full card name ${card.name}` };
      }

      const tokens = cardName.split(" ");
      const tokenHits = tokens.filter((token) => clean.includes(token)).length;
      const confidence = tokens.length ? tokenHits / tokens.length : 0;
      return { card, confidence, reason: `Token overlap ${tokenHits}/${tokens.length}` };
    })
    .sort((a, b) => b.confidence - a.confidence);

  const best = nameRanked[0];
  if (!best || best.confidence < 0.5) {
    return null;
  }

  return best;
}
