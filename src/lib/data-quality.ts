import type { DataQualitySnapshot, GemIndexDatabase, SourceCount } from "./types";

const DEFAULT_THRESHOLDS = {
  minLiveSets: 20,
  minLiveCards: 200,
  minLiveSales: 500,
  minLiveSalesCardCoveragePct: 25,
  minLivePopulationReports: 100,
  minLivePopulationCardCoveragePct: 10,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toPct(numerator: number, denominator: number): number {
  if (!denominator) {
    return 0;
  }
  return round2((numerator / denominator) * 100);
}

function sourceCount(total: number, seeded: number): SourceCount {
  const live = Math.max(0, total - seeded);
  return {
    total,
    seeded,
    live,
    livePct: toPct(live, total),
  };
}

function isSeedSale(entry: GemIndexDatabase["sales"][number]): boolean {
  return entry.provider === "SEED" || entry.source === "seeded-market-feed";
}

function parseThreshold(name: keyof typeof DEFAULT_THRESHOLDS): number {
  const envKeyByName: Record<keyof typeof DEFAULT_THRESHOLDS, string> = {
    minLiveSets: "DATA_QUALITY_MIN_LIVE_SETS",
    minLiveCards: "DATA_QUALITY_MIN_LIVE_CARDS",
    minLiveSales: "DATA_QUALITY_MIN_LIVE_SALES",
    minLiveSalesCardCoveragePct: "DATA_QUALITY_MIN_LIVE_SALES_CARD_COVERAGE_PCT",
    minLivePopulationReports: "DATA_QUALITY_MIN_LIVE_POPULATION_REPORTS",
    minLivePopulationCardCoveragePct: "DATA_QUALITY_MIN_LIVE_POPULATION_CARD_COVERAGE_PCT",
  };

  const raw = Number(process.env[envKeyByName[name]]);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_THRESHOLDS[name];
  }
  return raw;
}

export function assessDataQuality(db: GemIndexDatabase): DataQualitySnapshot {
  const thresholds = {
    minLiveSets: parseThreshold("minLiveSets"),
    minLiveCards: parseThreshold("minLiveCards"),
    minLiveSales: parseThreshold("minLiveSales"),
    minLiveSalesCardCoveragePct: parseThreshold("minLiveSalesCardCoveragePct"),
    minLivePopulationReports: parseThreshold("minLivePopulationReports"),
    minLivePopulationCardCoveragePct: parseThreshold("minLivePopulationCardCoveragePct"),
  };

  const setSeeded = db.sets.filter((entry) => entry.source === "SEED").length;
  const cardSeeded = db.cards.filter((entry) => entry.source === "SEED").length;
  const populationSeeded = db.populationReports.filter((entry) => entry.source === "SEED").length;
  const salesSeeded = db.sales.filter((entry) => isSeedSale(entry)).length;

  const sets = sourceCount(db.sets.length, setSeeded);
  const cards = sourceCount(db.cards.length, cardSeeded);
  const populationReports = sourceCount(db.populationReports.length, populationSeeded);
  const sales = sourceCount(db.sales.length, salesSeeded);

  const liveSalesCardIds = new Set(
    db.sales.filter((entry) => !isSeedSale(entry)).map((entry) => entry.cardId),
  );
  const livePopulationCardIds = new Set(
    db.populationReports
      .filter((entry) => entry.source !== "SEED")
      .map((entry) => entry.cardId),
  );

  const liveSalesCardCoveragePct = toPct(liveSalesCardIds.size, db.cards.length);
  const livePopulationCardCoveragePct = toPct(livePopulationCardIds.size, db.cards.length);

  const catalogReady = sets.live >= thresholds.minLiveSets && cards.live >= thresholds.minLiveCards;
  const salesReady =
    sales.live >= thresholds.minLiveSales &&
    liveSalesCardCoveragePct >= thresholds.minLiveSalesCardCoveragePct;
  const populationsReady =
    populationReports.live >= thresholds.minLivePopulationReports &&
    livePopulationCardCoveragePct >= thresholds.minLivePopulationCardCoveragePct;
  const investmentMetricsReady = catalogReady && salesReady && populationsReady;

  const blockers: string[] = [];
  if (!catalogReady) {
    blockers.push(
      `catalog live sets/cards ${sets.live}/${cards.live} (need ${thresholds.minLiveSets}/${thresholds.minLiveCards})`,
    );
  }
  if (!salesReady) {
    blockers.push(
      `live sales ${sales.live} and card coverage ${liveSalesCardCoveragePct}% (need ${thresholds.minLiveSales} and ${thresholds.minLiveSalesCardCoveragePct}%)`,
    );
  }
  if (!populationsReady) {
    blockers.push(
      `live population reports ${populationReports.live} and card coverage ${livePopulationCardCoveragePct}% (need ${thresholds.minLivePopulationReports} and ${thresholds.minLivePopulationCardCoveragePct}%)`,
    );
  }

  const anyLive =
    sets.live > 0 || cards.live > 0 || sales.live > 0 || populationReports.live > 0;
  const status = investmentMetricsReady
    ? "LIVE_READY"
    : anyLive
      ? "PARTIAL_LIVE"
      : "SEEDED";
  const labelByStatus = {
    SEEDED: "Seeded",
    PARTIAL_LIVE: "Partial Live",
    LIVE_READY: "Live Ready",
  } as const;

  return {
    status,
    label: labelByStatus[status],
    investmentMetricsReady,
    blockingReason: investmentMetricsReady
      ? undefined
      : `Investment metrics are hidden until live coverage is sufficient: ${blockers.join("; ")}.`,
    counts: {
      sets,
      cards,
      sales,
      populationReports,
      liveSalesCards: liveSalesCardIds.size,
      livePopulationCards: livePopulationCardIds.size,
      totalCards: db.cards.length,
      liveSalesCardCoveragePct,
      livePopulationCardCoveragePct,
    },
    thresholds,
    evaluatedAt: new Date().toISOString(),
  };
}
