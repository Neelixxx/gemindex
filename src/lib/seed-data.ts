import type {
  CardRecord,
  GemIndexDatabase,
  PopulationReportRecord,
  PokemonSetRecord,
  SaleRecord,
} from "./types";

const MONTHS = [
  "2025-03-01",
  "2025-04-01",
  "2025-05-01",
  "2025-06-01",
  "2025-07-01",
  "2025-08-01",
  "2025-09-01",
  "2025-10-01",
  "2025-11-01",
  "2025-12-01",
  "2026-01-01",
  "2026-02-01",
];

interface CardSeed {
  setCode: string;
  name: string;
  cardNumber: string;
  rarity: string;
  baseRaw: number;
  multiplierPsa10: number;
  multiplierTag10: number;
  trendPerMonth: number;
  volatility: number;
  psaTotal: number;
  psaGemRate: number;
  tagTotal: number;
  tagGemRate: number;
}

const setsSeed: Array<Pick<PokemonSetRecord, "code" | "name" | "releaseDate">> = [
  { code: "base1", name: "Base Set", releaseDate: "1999-01-09" },
  { code: "neo2", name: "Neo Discovery", releaseDate: "2001-06-01" },
  { code: "ecard3", name: "Skyridge", releaseDate: "2003-05-12" },
  { code: "sm115", name: "Hidden Fates", releaseDate: "2019-08-23" },
  { code: "swsh7", name: "Evolving Skies", releaseDate: "2021-08-27" },
  { code: "swsh12pt5", name: "Crown Zenith", releaseDate: "2023-01-20" },
  { code: "sv2", name: "Paldea Evolved", releaseDate: "2023-06-09" },
  { code: "sv4pt5", name: "Paldean Fates", releaseDate: "2024-01-26" },
];

const cardsSeed: CardSeed[] = [
  {
    setCode: "base1",
    name: "Charizard",
    cardNumber: "4",
    rarity: "Holo Rare",
    baseRaw: 280,
    multiplierPsa10: 20,
    multiplierTag10: 17.5,
    trendPerMonth: 0.013,
    volatility: 0.11,
    psaTotal: 59000,
    psaGemRate: 0.11,
    tagTotal: 320,
    tagGemRate: 0.19,
  },
  {
    setCode: "base1",
    name: "Blastoise",
    cardNumber: "2",
    rarity: "Holo Rare",
    baseRaw: 120,
    multiplierPsa10: 11.5,
    multiplierTag10: 10.8,
    trendPerMonth: 0.008,
    volatility: 0.08,
    psaTotal: 25000,
    psaGemRate: 0.16,
    tagTotal: 190,
    tagGemRate: 0.23,
  },
  {
    setCode: "neo2",
    name: "Umbreon",
    cardNumber: "13",
    rarity: "Holo Rare",
    baseRaw: 150,
    multiplierPsa10: 10.9,
    multiplierTag10: 10.1,
    trendPerMonth: 0.01,
    volatility: 0.1,
    psaTotal: 8000,
    psaGemRate: 0.14,
    tagTotal: 170,
    tagGemRate: 0.27,
  },
  {
    setCode: "ecard3",
    name: "Crystal Charizard",
    cardNumber: "146",
    rarity: "Secret Rare",
    baseRaw: 920,
    multiplierPsa10: 6.1,
    multiplierTag10: 5.9,
    trendPerMonth: 0.012,
    volatility: 0.14,
    psaTotal: 2900,
    psaGemRate: 0.03,
    tagTotal: 64,
    tagGemRate: 0.08,
  },
  {
    setCode: "sm115",
    name: "Charizard-GX",
    cardNumber: "SV49",
    rarity: "Shiny Vault",
    baseRaw: 330,
    multiplierPsa10: 4.8,
    multiplierTag10: 4.5,
    trendPerMonth: 0.006,
    volatility: 0.09,
    psaTotal: 44000,
    psaGemRate: 0.33,
    tagTotal: 420,
    tagGemRate: 0.41,
  },
  {
    setCode: "swsh7",
    name: "Umbreon VMAX",
    cardNumber: "215",
    rarity: "Alternate Art",
    baseRaw: 810,
    multiplierPsa10: 1.85,
    multiplierTag10: 1.76,
    trendPerMonth: 0.018,
    volatility: 0.16,
    psaTotal: 39000,
    psaGemRate: 0.23,
    tagTotal: 510,
    tagGemRate: 0.31,
  },
  {
    setCode: "swsh7",
    name: "Rayquaza VMAX",
    cardNumber: "218",
    rarity: "Alternate Art",
    baseRaw: 510,
    multiplierPsa10: 1.9,
    multiplierTag10: 1.81,
    trendPerMonth: 0.014,
    volatility: 0.13,
    psaTotal: 26000,
    psaGemRate: 0.26,
    tagTotal: 340,
    tagGemRate: 0.34,
  },
  {
    setCode: "swsh7",
    name: "Dragonite V",
    cardNumber: "192",
    rarity: "Alternate Art",
    baseRaw: 165,
    multiplierPsa10: 2.1,
    multiplierTag10: 1.95,
    trendPerMonth: 0.012,
    volatility: 0.1,
    psaTotal: 21000,
    psaGemRate: 0.29,
    tagTotal: 280,
    tagGemRate: 0.38,
  },
  {
    setCode: "swsh12pt5",
    name: "Mewtwo VSTAR",
    cardNumber: "GG44",
    rarity: "Galarian Gallery",
    baseRaw: 60,
    multiplierPsa10: 2.25,
    multiplierTag10: 2.1,
    trendPerMonth: 0.004,
    volatility: 0.08,
    psaTotal: 15000,
    psaGemRate: 0.37,
    tagTotal: 260,
    tagGemRate: 0.44,
  },
  {
    setCode: "swsh12pt5",
    name: "Giratina VSTAR",
    cardNumber: "GG69",
    rarity: "Galarian Gallery",
    baseRaw: 128,
    multiplierPsa10: 2.15,
    multiplierTag10: 2.03,
    trendPerMonth: 0.009,
    volatility: 0.1,
    psaTotal: 12000,
    psaGemRate: 0.35,
    tagTotal: 210,
    tagGemRate: 0.43,
  },
  {
    setCode: "sv2",
    name: "Magikarp",
    cardNumber: "203",
    rarity: "Illustration Rare",
    baseRaw: 115,
    multiplierPsa10: 1.78,
    multiplierTag10: 1.69,
    trendPerMonth: 0.022,
    volatility: 0.15,
    psaTotal: 16500,
    psaGemRate: 0.21,
    tagTotal: 240,
    tagGemRate: 0.29,
  },
  {
    setCode: "sv2",
    name: "Iono",
    cardNumber: "269",
    rarity: "Special Illustration Rare",
    baseRaw: 78,
    multiplierPsa10: 2.05,
    multiplierTag10: 1.9,
    trendPerMonth: 0.011,
    volatility: 0.12,
    psaTotal: 19000,
    psaGemRate: 0.3,
    tagTotal: 300,
    tagGemRate: 0.37,
  },
  {
    setCode: "sv2",
    name: "Tyranitar",
    cardNumber: "222",
    rarity: "Illustration Rare",
    baseRaw: 36,
    multiplierPsa10: 2.5,
    multiplierTag10: 2.32,
    trendPerMonth: 0.007,
    volatility: 0.09,
    psaTotal: 9800,
    psaGemRate: 0.32,
    tagTotal: 190,
    tagGemRate: 0.4,
  },
  {
    setCode: "sv4pt5",
    name: "Charizard ex",
    cardNumber: "234",
    rarity: "Special Illustration Rare",
    baseRaw: 160,
    multiplierPsa10: 2.35,
    multiplierTag10: 2.2,
    trendPerMonth: 0.016,
    volatility: 0.14,
    psaTotal: 24000,
    psaGemRate: 0.19,
    tagTotal: 350,
    tagGemRate: 0.28,
  },
  {
    setCode: "sv4pt5",
    name: "Mew ex",
    cardNumber: "232",
    rarity: "Special Illustration Rare",
    baseRaw: 85,
    multiplierPsa10: 2.4,
    multiplierTag10: 2.26,
    trendPerMonth: 0.008,
    volatility: 0.1,
    psaTotal: 13700,
    psaGemRate: 0.31,
    tagTotal: 240,
    tagGemRate: 0.39,
  },
  {
    setCode: "sv4pt5",
    name: "Gardevoir ex",
    cardNumber: "233",
    rarity: "Special Illustration Rare",
    baseRaw: 66,
    multiplierPsa10: 2.32,
    multiplierTag10: 2.18,
    trendPerMonth: 0.007,
    volatility: 0.09,
    psaTotal: 9100,
    psaGemRate: 0.34,
    tagTotal: 170,
    tagGemRate: 0.42,
  },
];

function makeId(prefix: string, value: string): string {
  return `${prefix}_${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;
}

function seededNoise(seed: string, index: number): number {
  let hash = 0;
  const key = `${seed}-${index}`;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const x = Math.sin(hash * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildCatalog(): {
  sets: PokemonSetRecord[];
  cards: CardRecord[];
  populations: PopulationReportRecord[];
  sales: SaleRecord[];
} {
  const sets: PokemonSetRecord[] = setsSeed.map((set) => ({
    id: makeId("set", set.code),
    code: set.code,
    name: set.name,
    releaseDate: set.releaseDate,
    source: "SEED",
    externalId: set.code,
    lastSyncedAt: "2026-02-01T00:00:00.000Z",
  }));

  const setIdByCode = new Map(sets.map((set) => [set.code, set.id]));
  const cards: CardRecord[] = [];
  const populations: PopulationReportRecord[] = [];
  const sales: SaleRecord[] = [];

  cardsSeed.forEach((seedCard) => {
    const setId = setIdByCode.get(seedCard.setCode);
    if (!setId) {
      return;
    }

    const cardId = makeId("card", `${seedCard.setCode}-${seedCard.cardNumber}-${seedCard.name}`);
    cards.push({
      id: cardId,
      setId,
      name: seedCard.name,
      cardNumber: seedCard.cardNumber,
      rarity: seedCard.rarity,
      source: "SEED",
      lastSyncedAt: "2026-02-01T00:00:00.000Z",
    });

    populations.push({
      id: makeId("pop", `${cardId}-psa`),
      cardId,
      grader: "PSA",
      totalGraded: seedCard.psaTotal,
      grade10: Math.round(seedCard.psaTotal * seedCard.psaGemRate),
      asOfDate: "2026-02-01",
      source: "SEED",
    });

    populations.push({
      id: makeId("pop", `${cardId}-tag`),
      cardId,
      grader: "TAG",
      totalGraded: seedCard.tagTotal,
      grade10: Math.round(seedCard.tagTotal * seedCard.tagGemRate),
      asOfDate: "2026-02-01",
      source: "SEED",
    });

    MONTHS.forEach((month, monthIndex) => {
      const trendFactor = 1 + seedCard.trendPerMonth * monthIndex;
      const cyclical = 1 + (seededNoise(cardId, monthIndex) - 0.5) * seedCard.volatility;
      const rawAnchor = seedCard.baseRaw * trendFactor * cyclical;
      const conditionModels: Array<{ condition: "RAW" | "PSA10" | "TAG10"; multiplier: number }> = [
        { condition: "RAW", multiplier: 1 },
        { condition: "PSA10", multiplier: seedCard.multiplierPsa10 },
        { condition: "TAG10", multiplier: seedCard.multiplierTag10 },
      ];

      conditionModels.forEach(({ condition, multiplier }) => {
        const count = 1 + Math.floor(seededNoise(`${cardId}-${condition}`, monthIndex) * 4);
        for (let i = 0; i < count; i += 1) {
          const spread = 0.94 + seededNoise(`${cardId}-${condition}-${i}`, monthIndex) * 0.12;
          const saleDate = new Date(month);
          saleDate.setUTCDate(4 + i * 6);

          sales.push({
            id: makeId("sale", `${cardId}-${condition}-${month}-${i}`),
            cardId,
            condition,
            priceUsd: roundUsd(rawAnchor * multiplier * spread),
            saleDate: saleDate.toISOString(),
            source: "seeded-market-feed",
            provider: "SEED",
            currency: "USD",
          });
        }
      });
    });
  });

  return { sets, cards, populations, sales };
}

export function createSeedDatabase(): GemIndexDatabase {
  const { sets, cards, populations, sales } = buildCatalog();

  const now = "2026-02-01T00:00:00.000Z";

  return {
    version: 4,
    sets,
    cards,
    populationReports: populations,
    sales,
    users: [
      {
        id: "user_default",
        name: "Jeff",
        email: "demo@gemindex.local",
        passwordHash: "$2b$10$XQr.sXlDCUQJhWKiJWPdiOzUR7RvrEq11V9damPhOQ16tp4suEiPe",
        role: "ADMIN",
        subscriptionTier: "ELITE",
        subscriptionStatus: "ACTIVE",
        subscriptionCurrentPeriodEnd: "2027-02-01T00:00:00.000Z",
        emailVerified: true,
        emailVerifiedAt: now,
        totpEnabled: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
    emailVerificationTokens: [],
    passwordResetTokens: [],
    emailOutbox: [],
    syncJobs: [
      {
        id: "job_catalog_sync",
        type: "CATALOG_SYNC",
        name: "Catalog Sync",
        enabled: true,
        intervalMinutes: 720,
        nextRunAt: now,
        running: false,
        options: { pageLimit: 15 },
      },
      {
        id: "job_sales_sync",
        type: "SALES_SYNC",
        name: "Sales Sync",
        enabled: true,
        intervalMinutes: 60,
        nextRunAt: now,
        running: false,
        options: { pageLimit: 20 },
      },
      {
        id: "job_tcgplayer_direct_sync",
        type: "TCGPLAYER_DIRECT_SYNC",
        name: "TCGplayer Direct Sync",
        enabled: false,
        intervalMinutes: 180,
        nextRunAt: now,
        running: false,
        options: { cardLimit: 150 },
      },
    ],
    syncTasks: [],
    collectionItems: [
      {
        id: "collection_1",
        userId: "user_default",
        cardId: makeId("card", "swsh7-215-umbreon-vmax"),
        ownershipType: "GRADED",
        grader: "PSA",
        grade: 10,
        quantity: 1,
        acquisitionPriceUsd: 1080,
        acquiredAt: "2025-10-11",
        notes: "Moonbreon long-term hold",
      },
      {
        id: "collection_2",
        userId: "user_default",
        cardId: makeId("card", "sv2-203-magikarp"),
        ownershipType: "RAW",
        quantity: 2,
        acquisitionPriceUsd: 88,
        acquiredAt: "2025-09-08",
      },
    ],
    wishlistItems: [
      {
        id: "wishlist_1",
        userId: "user_default",
        cardId: makeId("card", "ecard3-146-crystal-charizard"),
        targetPriceUsd: 780,
        priority: 1,
        createdAt: "2026-01-18",
      },
    ],
    sealedInventoryItems: [
      {
        id: "sealed_1",
        userId: "user_default",
        setId: makeId("set", "swsh7"),
        productName: "Evolving Skies Booster Box",
        productType: "BOOSTER_BOX",
        quantity: 3,
        acquisitionPriceUsd: 165,
        estimatedValueUsd: 730,
        acquiredAt: "2023-02-11",
        notes: "2 long-term hold, 1 potential flip",
      },
    ],
    scanEvents: [],
    sync: {},
  };
}
