import { readDb, withDbMutation } from "../db";
import type { CardRecord, SaleRecord } from "../types";

const API_BASE = "https://api.tcgplayer.com";
const TOKEN_PATH = "/token";

type TcgplayerApiResponse<T> = {
  success: boolean;
  errors: string[];
  results: T[];
  totalItems?: number;
};

type TcgplayerTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type TcgplayerGroup = {
  groupId: number;
  name: string;
  abbreviation?: string;
  categoryId: number;
};

type TcgplayerProduct = {
  productId: number;
  name: string;
  cleanName?: string;
  imageUrl?: string;
  categoryId: number;
  groupId: number;
  url?: string;
};

type TcgplayerPrice = {
  productId: number;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
  subTypeName?: string;
};

type TokenCache = {
  token: string;
  expiresAt: number;
};

type ProductMatch = {
  product: TcgplayerProduct;
  confidence: number;
};

let tokenCache: TokenCache | null = null;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function todayKey(value: string): string {
  return value.slice(0, 10);
}

function bearerHeaders(token: string): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/json",
    Authorization: `bearer ${token}`,
  };

  const accessToken = process.env.TCGPLAYER_ACCESS_TOKEN;
  if (accessToken) {
    headers["X-Tcg-Access-Token"] = accessToken;
  }

  return headers;
}

async function getBearerToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 30_000) {
    return tokenCache.token;
  }

  const clientId = process.env.TCGPLAYER_PUBLIC_KEY;
  const clientSecret = process.env.TCGPLAYER_PRIVATE_KEY;
  if (!clientId || !clientSecret) {
    throw new Error("TCGplayer credentials missing. Set TCGPLAYER_PUBLIC_KEY and TCGPLAYER_PRIVATE_KEY.");
  }

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  const response = await fetch(`${API_BASE}${TOKEN_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`TCGplayer token request failed (${response.status}).`);
  }

  const tokenJson = (await response.json()) as TcgplayerTokenResponse;
  if (!tokenJson.access_token) {
    throw new Error("TCGplayer token response missing access_token.");
  }

  tokenCache = {
    token: tokenJson.access_token,
    expiresAt: now + tokenJson.expires_in * 1000,
  };

  return tokenJson.access_token;
}

async function tcgGet<T>(path: string, params?: Record<string, string | number>): Promise<T[]> {
  const token = await getBearerToken();
  const search = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      search.set(key, String(value));
    }
  }

  const url = `${API_BASE}${path}${search.toString() ? `?${search}` : ""}`;
  const response = await fetch(url, {
    method: "GET",
    headers: bearerHeaders(token),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`TCGplayer request failed (${response.status}) for ${path}`);
  }

  const payload = (await response.json()) as TcgplayerApiResponse<T>;
  if (!payload.success) {
    throw new Error(payload.errors?.join("; ") || `TCGplayer request failed for ${path}`);
  }

  return payload.results ?? [];
}

async function fetchCategoryGroups(categoryId: number): Promise<TcgplayerGroup[]> {
  const limit = 100;
  let offset = 0;
  const all: TcgplayerGroup[] = [];

  while (true) {
    const rows = await tcgGet<TcgplayerGroup>(`/catalog/categories/${categoryId}/groups`, {
      offset,
      limit,
    });

    all.push(...rows);
    if (rows.length < limit) {
      break;
    }
    offset += limit;
  }

  return all;
}

function scoreProduct(card: CardRecord, candidate: TcgplayerProduct): number {
  const cardName = normalize(card.name);
  const productName = normalize(candidate.name);
  const cleanName = normalize(candidate.cleanName ?? candidate.name);
  let score = 0;

  if (productName === cardName || cleanName === cardName) {
    score += 8;
  }
  if (productName.includes(cardName) || cleanName.includes(cardName)) {
    score += 5;
  }

  const number = card.cardNumber.toLowerCase();
  if (candidate.name.toLowerCase().includes(number)) {
    score += 2;
  }

  const cardTokens = cardName.split(" ").filter((token) => token.length > 2);
  const tokenHits = cardTokens.filter((token) => productName.includes(token)).length;
  score += tokenHits;

  return score;
}

async function searchProduct(
  card: CardRecord,
  categoryId: number,
  groupId: number,
): Promise<ProductMatch | null> {
  const rows = await tcgGet<TcgplayerProduct>("/catalog/products", {
    categoryId,
    groupId,
    productTypes: "Cards",
    productName: card.name,
    limit: 30,
    offset: 0,
  });

  if (!rows.length) {
    return null;
  }

  const top = rows
    .map((row) => ({ row, score: scoreProduct(card, row) }))
    .sort((a, b) => b.score - a.score)[0];

  if (!top) {
    return null;
  }

  return {
    product: top.row,
    confidence: Math.max(0, Math.min(1, top.score / 15)),
  };
}

function choosePrice(rows: TcgplayerPrice[]): number | null {
  if (!rows.length) {
    return null;
  }

  const normal = rows.find((row) => (row.subTypeName ?? "").toLowerCase() === "normal");
  const preferred = normal ?? rows.find((row) => row.marketPrice != null) ?? rows[0];
  return preferred.marketPrice ?? preferred.midPrice ?? preferred.lowPrice ?? null;
}

async function fetchProductPrices(productIds: number[]): Promise<Map<number, number>> {
  const output = new Map<number, number>();

  for (const part of chunk(productIds, 50)) {
    const rows = await tcgGet<TcgplayerPrice>(`/pricing/product/${part.join(",")}`);
    const byProduct = new Map<number, TcgplayerPrice[]>();

    rows.forEach((row) => {
      const list = byProduct.get(row.productId) ?? [];
      list.push(row);
      byProduct.set(row.productId, list);
    });

    byProduct.forEach((priceRows, productId) => {
      const selected = choosePrice(priceRows);
      if (typeof selected === "number" && selected > 0) {
        output.set(productId, round2(selected));
      }
    });
  }

  return output;
}

function upsertSale(existing: SaleRecord[], sale: SaleRecord): void {
  const prior = existing.find((entry) => entry.providerRef === sale.providerRef);
  if (prior) {
    prior.priceUsd = sale.priceUsd;
    prior.saleDate = sale.saleDate;
    prior.source = sale.source;
    prior.currency = sale.currency;
    prior.provider = sale.provider;
    return;
  }
  existing.push(sale);
}

export async function syncDirectTcgplayerPrices(options?: {
  cardLimit?: number;
  categoryId?: number;
}): Promise<{
  cardsEvaluated: number;
  cardsMatched: number;
  pricesUpserted: number;
  groupsLoaded: number;
}> {
  const db = await readDb();
  const categoryId = options?.categoryId ?? Number(process.env.TCGPLAYER_CATEGORY_ID ?? 3);
  const cardLimit = Math.max(1, options?.cardLimit ?? 150);

  const cardsToScan = [...db.cards]
    .filter((card) => card.source === "POKEMONTCG" || card.source === "SEED")
    .sort((a, b) => (a.tcgplayerProductId ? 1 : -1) - (b.tcgplayerProductId ? 1 : -1))
    .slice(0, cardLimit);

  const groups = await fetchCategoryGroups(categoryId);
  const groupsByName = new Map(groups.map((group) => [normalize(group.name), group.groupId]));

  const cardById = new Map(db.cards.map((card) => [card.id, card]));
  const setById = new Map(db.sets.map((set) => [set.id, set]));

  const cardToProduct = new Map<
    string,
    {
      productId: number;
      groupId?: number;
      confidence: number;
      method: "AUTO" | "MANUAL";
    }
  >();

  for (const card of cardsToScan) {
    if (card.tcgplayerProductId) {
      cardToProduct.set(card.id, {
        productId: card.tcgplayerProductId,
        groupId: card.tcgplayerGroupId,
        confidence: card.tcgplayerMatchConfidence ?? 0.8,
        method: card.tcgplayerMatchMethod === "MANUAL" ? "MANUAL" : "AUTO",
      });
      continue;
    }

    const setName = setById.get(card.setId)?.name;
    if (!setName) {
      continue;
    }

    const groupId = card.tcgplayerGroupId ?? groupsByName.get(normalize(setName));
    if (!groupId) {
      continue;
    }

    const match = await searchProduct(card, categoryId, groupId);
    if (!match) {
      continue;
    }

    cardToProduct.set(card.id, {
      productId: match.product.productId,
      groupId,
      confidence: match.confidence,
      method: "AUTO",
    });
  }

  const uniqueProductIds = [...new Set([...cardToProduct.values()].map((match) => match.productId))];
  const productPrices = await fetchProductPrices(uniqueProductIds);
  const now = new Date().toISOString();
  const day = todayKey(now);

  await withDbMutation((mutable) => {
    cardToProduct.forEach((match, cardId) => {
      const card = mutable.cards.find((entry) => entry.id === cardId);
      if (card) {
        card.tcgplayerGroupId = match.groupId ?? card.tcgplayerGroupId;
        card.tcgplayerProductId = match.productId;
        card.tcgplayerMatchConfidence = match.confidence;
        card.tcgplayerMatchMethod =
          card.tcgplayerMatchMethod === "MANUAL" ? "MANUAL" : match.method;
        card.tcgplayerMatchedAt = now;
        card.lastSyncedAt = now;
      }
    });

    cardToProduct.forEach((match, cardId) => {
      const card = cardById.get(cardId);
      const marketPrice = productPrices.get(match.productId);
      if (!card || typeof marketPrice !== "number") {
        return;
      }

      upsertSale(mutable.sales, {
        id: `sale_tcgdirect_${cardId}_${day}`,
        cardId: card.id,
        condition: "RAW",
        priceUsd: marketPrice,
        saleDate: now,
        source: "TCGplayer Direct API",
        provider: "TCGPLAYER_DIRECT",
        providerRef: `tcgdirect:${match.productId}:${day}`,
        currency: "USD",
      });
    });
  });

  return {
    cardsEvaluated: cardsToScan.length,
    cardsMatched: cardToProduct.size,
    pricesUpserted: [...cardToProduct.values()].filter((match) => productPrices.has(match.productId))
      .length,
    groupsLoaded: groups.length,
  };
}
