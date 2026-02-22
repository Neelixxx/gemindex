import type { Grader, SealedInventoryRecord } from "./types";

type ProductType = SealedInventoryRecord["productType"];

export interface SealedLabelTemplate {
  id: string;
  productType: ProductType;
  label: string;
  keywords: string[];
}

export interface SlabLabelTemplate {
  id: string;
  grader?: Grader;
  keywords: string[];
}

export interface SealedBarcodeTemplate {
  barcode: string;
  setCode?: string;
  productType: ProductType;
  productName: string;
}

const sealedLabelTemplates: SealedLabelTemplate[] = [
  {
    id: "booster-box",
    productType: "BOOSTER_BOX",
    label: "Booster Box",
    keywords: ["booster box", "display box", "36 packs"],
  },
  {
    id: "etb",
    productType: "ELITE_TRAINER_BOX",
    label: "Elite Trainer Box",
    keywords: ["elite trainer box", "trainer box", "etb", "pokemon center elite trainer box"],
  },
  {
    id: "collection-box",
    productType: "COLLECTION_BOX",
    label: "Collection Box",
    keywords: ["collection box", "premium collection", "ultra premium collection", "upc"],
  },
  {
    id: "tin",
    productType: "TIN",
    label: "Tin",
    keywords: ["tin", "mini tin", "stacking tin"],
  },
  {
    id: "blister",
    productType: "BLISTER",
    label: "Blister",
    keywords: ["blister", "booster pack", "3 pack", "sleeved booster"],
  },
  {
    id: "other-sealed",
    productType: "OTHER",
    label: "Sealed Product",
    keywords: ["bundle", "booster bundle", "collection", "sealed"],
  },
];

const slabLabelTemplates: SlabLabelTemplate[] = [
  { id: "psa", grader: "PSA", keywords: ["psa", "professional sports authenticator", "cert"] },
  { id: "tag", grader: "TAG", keywords: ["tag grading", "tag slab", "tag cert"] },
  { id: "slab-generic", keywords: ["gem mint", "pristine", "mint", "graded"] },
];

const sealedBarcodeTemplates: SealedBarcodeTemplate[] = [];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function keywordScore(normalizedText: string, keywords: string[]): number {
  if (!keywords.length) {
    return 0;
  }
  const matches = keywords.filter((token) => normalizedText.includes(normalize(token))).length;
  return matches / keywords.length;
}

export function extractBarcodeLikeTokens(text: string): string[] {
  const raw = text.match(/\b\d{12,14}\b/g) ?? [];
  return [...new Set(raw)];
}

export function matchSealedLabelTemplate(
  text: string,
): { productType: ProductType; productName: string; confidence: number; templateId: string } | null {
  const normalizedText = normalize(text);
  if (!normalizedText) {
    return null;
  }

  const ranked = sealedLabelTemplates
    .map((template) => ({
      ...template,
      score: keywordScore(normalizedText, template.keywords),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < 0.15) {
    return null;
  }

  return {
    productType: best.productType,
    productName: best.label,
    confidence: Math.max(0.35, best.score),
    templateId: best.id,
  };
}

export function matchSlabLabelTemplate(
  text: string,
): { grader?: Grader; confidence: number; templateId: string } | null {
  const normalizedText = normalize(text);
  if (!normalizedText) {
    return null;
  }

  const ranked = slabLabelTemplates
    .map((template) => ({
      ...template,
      score: keywordScore(normalizedText, template.keywords),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < 0.2) {
    return null;
  }

  return {
    grader: best.grader,
    confidence: Math.max(0.35, best.score),
    templateId: best.id,
  };
}

export function matchSealedBarcodeTemplate(
  barcode: string | undefined,
): (SealedBarcodeTemplate & { confidence: number }) | null {
  if (!barcode) {
    return null;
  }

  const normalized = barcode.trim();
  if (!normalized) {
    return null;
  }

  const exact = sealedBarcodeTemplates.find((template) => template.barcode === normalized);
  if (!exact) {
    return null;
  }

  return {
    ...exact,
    confidence: 0.97,
  };
}
