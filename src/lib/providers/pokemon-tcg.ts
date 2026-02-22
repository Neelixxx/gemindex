import { setTimeout as delay } from "node:timers/promises";

const API_BASE = "https://api.pokemontcg.io/v2";
const DEFAULT_PAGE_SIZE = 250;

type PokeTcgSet = {
  id: string;
  name: string;
  series?: string;
  releaseDate?: string;
  printedTotal?: number;
  total?: number;
  images?: {
    symbol?: string;
    logo?: string;
  };
  updatedAt?: string;
};

type PokeTcgCard = {
  id: string;
  name: string;
  number?: string;
  rarity?: string;
  supertype?: string;
  subtypes?: string[];
  set?: {
    id: string;
  };
  images?: {
    small?: string;
    large?: string;
  };
  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    prices?: Record<
      string,
      {
        low?: number;
        mid?: number;
        high?: number;
        market?: number;
        directLow?: number;
      }
    >;
  };
  cardmarket?: {
    url?: string;
    updatedAt?: string;
    prices?: {
      averageSellPrice?: number;
      avg1?: number;
      avg7?: number;
      avg30?: number;
      trendPrice?: number;
      lowPrice?: number;
      reverseHoloSell?: number;
      reverseHoloLow?: number;
      reverseHoloTrend?: number;
    };
  };
};

type PokeTcgResponse<T> = {
  data: T[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
};

function authHeaders(): HeadersInit {
  const apiKey = process.env.POKEMONTCG_API_KEY;
  if (!apiKey) {
    return {};
  }

  return { "X-Api-Key": apiKey };
}

function normalizeDate(value: string | undefined, fallback = new Date().toISOString()): string {
  if (!value) {
    return fallback;
  }

  const normalized = value.replace(/\//g, "-");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

async function fetchPage<T>(
  path: string,
  params: Record<string, string | number>,
  retries = 2,
): Promise<PokeTcgResponse<T>> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    search.set(key, String(value));
  }

  const url = `${API_BASE}${path}?${search.toString()}`;
  const response = await fetch(url, {
    headers: authHeaders(),
    cache: "no-store",
  });

  if (response.ok) {
    return (await response.json()) as PokeTcgResponse<T>;
  }

  if ((response.status === 429 || response.status >= 500) && retries > 0) {
    await delay(350);
    return fetchPage<T>(path, params, retries - 1);
  }

  throw new Error(`PokemonTCG API request failed (${response.status}) for ${url}`);
}

async function fetchAllPages<T>(
  path: string,
  params: Record<string, string | number>,
  pageLimit?: number,
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;

  while (true) {
    const result = await fetchPage<T>(path, {
      ...params,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
    });

    items.push(...result.data);

    const reachedTotal = page * result.pageSize >= result.totalCount;
    const hitPageLimit = typeof pageLimit === "number" && page >= pageLimit;
    if (reachedTotal || hitPageLimit || result.data.length === 0) {
      break;
    }

    page += 1;
  }

  return items;
}

export type LiveSetRecord = {
  externalId: string;
  code: string;
  name: string;
  series?: string;
  releaseDate: string;
  printedTotal?: number;
  total?: number;
  symbolUrl?: string;
  logoUrl?: string;
  lastSyncedAt: string;
};

export type LiveCardRecord = {
  externalId: string;
  setExternalId: string;
  name: string;
  cardNumber: string;
  rarity: string;
  imageUrl?: string;
  imageLargeUrl?: string;
  supertype?: string;
  subtypes?: string[];
  tcgplayerUrl?: string;
  cardmarketUrl?: string;
  tcgplayerRawUsd?: number;
  cardmarketRawEur?: number;
  priceAsOf: string;
};

function pickTcgplayerRaw(
  prices:
    | Record<
        string,
        {
          low?: number;
          mid?: number;
          high?: number;
          market?: number;
          directLow?: number;
        }
      >
    | undefined,
): number | undefined {
  if (!prices) {
    return undefined;
  }

  const preferredTypes = [
    "holofoil",
    "normal",
    "reverseHolofoil",
    "1stEditionHolofoil",
    "1stEditionNormal",
    "unlimitedHolofoil",
    "unlimitedNormal",
  ];

  for (const type of preferredTypes) {
    const row = prices[type];
    if (!row) {
      continue;
    }
    const value = row.market ?? row.mid ?? row.low;
    if (typeof value === "number" && value > 0) {
      return value;
    }
  }

  for (const row of Object.values(prices)) {
    const value = row.market ?? row.mid ?? row.low;
    if (typeof value === "number" && value > 0) {
      return value;
    }
  }

  return undefined;
}

function pickCardmarketRaw(
  prices:
    | {
        averageSellPrice?: number;
        avg1?: number;
        avg7?: number;
        avg30?: number;
        trendPrice?: number;
        lowPrice?: number;
        reverseHoloSell?: number;
        reverseHoloLow?: number;
        reverseHoloTrend?: number;
      }
    | undefined,
): number | undefined {
  if (!prices) {
    return undefined;
  }

  const candidates = [
    prices.avg30,
    prices.trendPrice,
    prices.averageSellPrice,
    prices.lowPrice,
    prices.reverseHoloTrend,
    prices.reverseHoloSell,
  ];

  return candidates.find((value) => typeof value === "number" && value > 0);
}

export async function fetchLiveSets(): Promise<LiveSetRecord[]> {
  const sets = await fetchAllPages<PokeTcgSet>("/sets", {
    orderBy: "releaseDate",
    select: "id,name,series,releaseDate,printedTotal,total,images,updatedAt",
  });

  const now = new Date().toISOString();
  return sets.map((set) => ({
    externalId: set.id,
    code: set.id,
    name: set.name,
    series: set.series,
    releaseDate: normalizeDate(set.releaseDate, now).slice(0, 10),
    printedTotal: set.printedTotal,
    total: set.total,
    symbolUrl: set.images?.symbol,
    logoUrl: set.images?.logo,
    lastSyncedAt: normalizeDate(set.updatedAt, now),
  }));
}

export async function fetchLiveCards(pageLimit?: number): Promise<LiveCardRecord[]> {
  const cards = await fetchAllPages<PokeTcgCard>(
    "/cards",
    {
      orderBy: "set.releaseDate,number",
      select:
        "id,name,number,rarity,supertype,subtypes,set,images,tcgplayer,cardmarket,updatedAt",
    },
    pageLimit,
  );

  const now = new Date().toISOString();
  return cards
    .filter((card) => card.set?.id)
    .map((card) => ({
      externalId: card.id,
      setExternalId: card.set?.id ?? "",
      name: card.name,
      cardNumber: card.number ?? "?",
      rarity: card.rarity ?? "Unknown",
      imageUrl: card.images?.small,
      imageLargeUrl: card.images?.large,
      supertype: card.supertype,
      subtypes: card.subtypes,
      tcgplayerUrl: card.tcgplayer?.url,
      cardmarketUrl: card.cardmarket?.url,
      tcgplayerRawUsd: pickTcgplayerRaw(card.tcgplayer?.prices),
      cardmarketRawEur: pickCardmarketRaw(card.cardmarket?.prices),
      priceAsOf: normalizeDate(card.tcgplayer?.updatedAt ?? card.cardmarket?.updatedAt, now),
    }));
}
