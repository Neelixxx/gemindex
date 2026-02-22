import type {
  CardCondition,
  CardMetrics,
  CardRecord,
  DashboardAlert,
  DashboardData,
  GemIndexDatabase,
  IndexPoint,
  MarketSeriesPoint,
  PopulationReportRecord,
  SaleRecord,
  SetMetrics,
} from "./types";
import { assessDataQuality } from "./data-quality";

const RARITY_SCORES: Record<string, number> = {
  "Secret Rare": 95,
  "Special Illustration Rare": 90,
  "Alternate Art": 88,
  "Shiny Vault": 84,
  "Galarian Gallery": 80,
  "Illustration Rare": 74,
  "Holo Rare": 68,
  Rare: 60,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function latestPopulation(
  populations: PopulationReportRecord[],
  cardId: string,
  grader: "PSA" | "TAG",
): PopulationReportRecord | undefined {
  return populations
    .filter((entry) => entry.cardId === cardId && entry.grader === grader)
    .sort((a, b) => new Date(b.asOfDate).getTime() - new Date(a.asOfDate).getTime())[0];
}

function salesForCondition(
  sales: SaleRecord[],
  cardId: string,
  condition: CardCondition,
): SaleRecord[] {
  return sales
    .filter((entry) => entry.cardId === cardId && entry.condition === condition)
    .sort((a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime());
}

function latestPrice(sales: SaleRecord[], cardId: string, condition: CardCondition): number {
  const entries = salesForCondition(sales, cardId, condition);
  return entries.length ? entries[entries.length - 1].priceUsd : 0;
}

function roiOverWindow(sales: SaleRecord[], cardId: string, condition: CardCondition): number {
  const entries = salesForCondition(sales, cardId, condition);
  if (entries.length < 2) {
    return 0;
  }
  const first = entries[0].priceUsd;
  const latest = entries[entries.length - 1].priceUsd;
  if (!first) {
    return 0;
  }
  return ((latest - first) / first) * 100;
}

function liquidityScore(sales: SaleRecord[], cardId: string): number {
  const now = new Date("2026-02-21T00:00:00.000Z").getTime();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  const recentSales = sales
    .filter((entry) => entry.cardId === cardId)
    .filter((entry) => now - new Date(entry.saleDate).getTime() <= ninetyDays)
    .sort((a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime());

  if (!recentSales.length) {
    return 0;
  }

  const intervals: number[] = [];
  for (let i = 1; i < recentSales.length; i += 1) {
    const deltaMs =
      new Date(recentSales[i].saleDate).getTime() -
      new Date(recentSales[i - 1].saleDate).getTime();
    intervals.push(deltaMs / (1000 * 60 * 60 * 24));
  }

  const avgGap = intervals.length ? average(intervals) : 30;
  const volumeComponent = Math.min(70, recentSales.length * 6.5);
  const velocityComponent = Math.min(30, (30 / Math.max(1, avgGap)) * 12);
  return round2(Math.min(100, volumeComponent + velocityComponent));
}

function scarcityScore(
  card: CardRecord,
  populations: PopulationReportRecord[],
  allTotals: number[],
): number {
  const psa = latestPopulation(populations, card.id, "PSA")?.totalGraded ?? 0;
  const tag = latestPopulation(populations, card.id, "TAG")?.totalGraded ?? 0;
  const total = psa + tag;

  if (!allTotals.length || !total) {
    return RARITY_SCORES[card.rarity] ?? 65;
  }

  const rank = allTotals.filter((entry) => entry <= total).length;
  const percentile = rank / allTotals.length;
  const populationScarcity = (1 - percentile) * 100;
  const rarityBonus = (RARITY_SCORES[card.rarity] ?? 65) * 0.35;
  return round2(populationScarcity * 0.65 + rarityBonus);
}

function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7);
}

function monthlySeries(
  sales: SaleRecord[],
  cardId: string,
  condition: CardCondition,
): Array<{ month: string; price: number }> {
  const buckets = new Map<string, number[]>();
  sales
    .filter((entry) => entry.cardId === cardId && entry.condition === condition)
    .forEach((entry) => {
      const key = monthKey(entry.saleDate);
      const existing = buckets.get(key) ?? [];
      existing.push(entry.priceUsd);
      buckets.set(key, existing);
    });

  return [...buckets.entries()]
    .map(([month, prices]) => ({ month, price: average(prices) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function volatilityFromSeries(series: Array<{ month: string; price: number }>): number {
  if (series.length < 3) {
    return 0;
  }
  const returns: number[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const previous = series[i - 1].price;
    const current = series[i].price;
    if (previous > 0) {
      returns.push((current - previous) / previous);
    }
  }
  return round2(stdDev(returns) * 100);
}

function grade10Rate(entry?: PopulationReportRecord): number {
  if (!entry || entry.totalGraded <= 0) {
    return 0;
  }
  return (entry.grade10 / entry.totalGraded) * 100;
}

function gradingArbitrage(
  rawPrice: number,
  psa10Price: number,
  gemRatePsa: number,
  gradingCost = 35,
): number {
  const p = gemRatePsa / 100;
  const expected = p * psa10Price + (1 - p) * rawPrice * 0.78;
  return round2(expected - (rawPrice + gradingCost));
}

export function marketSeries(db: GemIndexDatabase, cardId: string): MarketSeriesPoint[] {
  const raws = monthlySeries(db.sales, cardId, "RAW");
  const psa10 = monthlySeries(db.sales, cardId, "PSA10");
  const tag10 = monthlySeries(db.sales, cardId, "TAG10");
  const months = new Set([...raws, ...psa10, ...tag10].map((entry) => entry.month));

  return [...months]
    .map((month) => ({
      date: `${month}-01`,
      raw: raws.find((entry) => entry.month === month)?.price,
      psa10: psa10.find((entry) => entry.month === month)?.price,
      tag10: tag10.find((entry) => entry.month === month)?.price,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function cardMetrics(db: GemIndexDatabase): CardMetrics[] {
  const setById = new Map(db.sets.map((set) => [set.id, set]));
  const populationTotals = db.cards.map((card) => {
    const psa = latestPopulation(db.populationReports, card.id, "PSA")?.totalGraded ?? 0;
    const tag = latestPopulation(db.populationReports, card.id, "TAG")?.totalGraded ?? 0;
    return psa + tag;
  });

  return db.cards
    .map((card) => {
      const set = setById.get(card.setId);
      if (!set) {
        return null;
      }

      const psa = latestPopulation(db.populationReports, card.id, "PSA");
      const tag = latestPopulation(db.populationReports, card.id, "TAG");
      const gemRatePsa = grade10Rate(psa);
      const gemRateTag = grade10Rate(tag);
      const blendedDenominator = (psa?.totalGraded ?? 0) + (tag?.totalGraded ?? 0);
      const blendedNumerator = (psa?.grade10 ?? 0) + (tag?.grade10 ?? 0);
      const gemRateBlended =
        blendedDenominator > 0 ? (blendedNumerator / blendedDenominator) * 100 : 0;

      const rawPrice = latestPrice(db.sales, card.id, "RAW");
      const psa10Price = latestPrice(db.sales, card.id, "PSA10");
      const tag10Price = latestPrice(db.sales, card.id, "TAG10");

      return {
        cardId: card.id,
        setId: card.setId,
        setName: set.name,
        cardLabel: `${card.name} ${card.cardNumber}`,
        rarity: card.rarity,
        rawPrice: round2(rawPrice),
        psa10Price: round2(psa10Price),
        tag10Price: round2(tag10Price),
        gemRatePsa: round2(gemRatePsa),
        gemRateTag: round2(gemRateTag),
        gemRateBlended: round2(gemRateBlended),
        liquidityScore: liquidityScore(db.sales, card.id),
        scarcityScore: scarcityScore(card, db.populationReports, populationTotals),
        roi12m: round2(roiOverWindow(db.sales, card.id, "RAW")),
        gradingArbitrageUsd: gradingArbitrage(rawPrice, psa10Price, gemRatePsa),
      } satisfies CardMetrics;
    })
    .filter((entry): entry is CardMetrics => Boolean(entry))
    .sort((a, b) => b.rawPrice - a.rawPrice);
}

function setSeries(db: GemIndexDatabase, setId: string): Array<{ month: string; totalValue: number }> {
  const cards = db.cards.filter((card) => card.setId === setId);
  const monthMap = new Map<string, number[]>();

  cards.forEach((card) => {
    monthlySeries(db.sales, card.id, "RAW").forEach((point) => {
      const bucket = monthMap.get(point.month) ?? [];
      bucket.push(point.price);
      monthMap.set(point.month, bucket);
    });
  });

  return [...monthMap.entries()]
    .map(([month, prices]) => ({
      month,
      totalValue: prices.reduce((sum, price) => sum + price, 0),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function setMetrics(db: GemIndexDatabase, metrics = cardMetrics(db)): SetMetrics[] {
  return db.sets
    .map((set) => {
      const inSet = metrics.filter((metric) => metric.setId === set.id);
      const totalSetValue = inSet.reduce((sum, metric) => sum + metric.rawPrice, 0);
      const series = setSeries(db, set.id);
      const first = series[0]?.totalValue ?? 0;
      const last = series[series.length - 1]?.totalValue ?? 0;
      const roi12m = first > 0 ? ((last - first) / first) * 100 : 0;

      return {
        setId: set.id,
        code: set.code,
        name: set.name,
        releaseDate: set.releaseDate,
        cardCount: inSet.length,
        totalSetValue: round2(totalSetValue),
        roi12m: round2(roi12m),
        volatility: volatilityFromSeries(
          series.map((entry) => ({ month: entry.month, price: entry.totalValue })),
        ),
      } satisfies SetMetrics;
    })
    .sort((a, b) => b.totalSetValue - a.totalSetValue);
}

export function cardIndexSeries(db: GemIndexDatabase): IndexPoint[] {
  const monthMap = new Map<string, number[]>();

  db.cards.forEach((card) => {
    const series = monthlySeries(db.sales, card.id, "RAW");
    if (series.length < 2) {
      return;
    }
    const baseline = series[0].price;
    if (!baseline) {
      return;
    }

    series.forEach((point) => {
      const normalized = (point.price / baseline) * 100;
      const bucket = monthMap.get(point.month) ?? [];
      bucket.push(normalized);
      monthMap.set(point.month, bucket);
    });
  });

  return [...monthMap.entries()]
    .map(([month, values]) => ({ date: `${month}-01`, value: round2(average(values)) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function alertLabel(db: GemIndexDatabase, cardId: string): string {
  const card = db.cards.find((entry) => entry.id === cardId);
  if (!card) {
    return cardId;
  }
  const set = db.sets.find((entry) => entry.id === card.setId);
  const setCode = set?.code.toUpperCase() ?? "N/A";
  return `${card.name} ${card.cardNumber} (${setCode})`;
}

export function dashboard(db: GemIndexDatabase): DashboardData {
  const dataQuality = assessDataQuality(db);
  const metrics = cardMetrics(db);

  if (!dataQuality.investmentMetricsReady) {
    return {
      generatedAt: new Date().toISOString(),
      totalTrackedCards: metrics.length,
      totalSets: db.sets.length,
      cardIndex: [],
      topUndervalued: [],
      flipperSignals: [],
      topArbitrage: [],
      dataQuality,
    };
  }

  const undervalued: DashboardAlert[] = metrics
    .map((metric) => {
      const series = marketSeries(db, metric.cardId).map((point) => point.raw).filter((value): value is number => typeof value === "number");
      if (series.length < 4) {
        return null;
      }
      const latest = series[series.length - 1];
      const avgRecent = average(series.slice(-4));
      const discount = avgRecent > 0 ? ((avgRecent - latest) / avgRecent) * 100 : 0;
      const score = discount * 0.7 + metric.liquidityScore * 0.3;

      if (discount < 8 || metric.liquidityScore < 45) {
        return null;
      }

      return {
        cardId: metric.cardId,
        label: alertLabel(db, metric.cardId),
        score: round2(score),
        reason: `${round2(discount)}% below recent average with liquidity ${metric.liquidityScore}`,
      } satisfies DashboardAlert;
    })
    .filter((entry): entry is DashboardAlert => Boolean(entry))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const flipperSignals: DashboardAlert[] = metrics
    .map((metric) => {
      const series = marketSeries(db, metric.cardId).map((point) => point.raw).filter((value): value is number => typeof value === "number");
      if (series.length < 5) {
        return null;
      }
      const latest = series[series.length - 1];
      const prior = series[series.length - 5];
      const momentum = prior > 0 ? ((latest - prior) / prior) * 100 : 0;

      if (momentum < 10 || metric.liquidityScore < 55) {
        return null;
      }

      return {
        cardId: metric.cardId,
        label: alertLabel(db, metric.cardId),
        score: round2(momentum * 0.6 + metric.liquidityScore * 0.4),
        reason: `4-month momentum ${round2(momentum)}% with liquidity ${metric.liquidityScore}`,
      } satisfies DashboardAlert;
    })
    .filter((entry): entry is DashboardAlert => Boolean(entry))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const topArbitrage: DashboardAlert[] = metrics
    .filter((metric) => metric.gradingArbitrageUsd > 0)
    .sort((a, b) => b.gradingArbitrageUsd - a.gradingArbitrageUsd)
    .slice(0, 6)
    .map((metric) => ({
      cardId: metric.cardId,
      label: alertLabel(db, metric.cardId),
      score: metric.gradingArbitrageUsd,
      reason: `Expected PSA grading edge: $${metric.gradingArbitrageUsd}`,
    }));

  return {
    generatedAt: new Date().toISOString(),
    totalTrackedCards: metrics.length,
    totalSets: db.sets.length,
    cardIndex: cardIndexSeries(db),
    topUndervalued: undervalued,
    flipperSignals,
    topArbitrage,
    dataQuality,
  };
}
