import { describe, expect, it } from "vitest";

import { cardIndexSeries, cardMetrics, dashboard, setMetrics } from "../src/lib/analytics";
import { createSeedDatabase } from "../src/lib/seed-data";

describe("analytics", () => {
  it("calculates blended gem rate for Umbreon VMAX", () => {
    const db = createSeedDatabase();
    const metrics = cardMetrics(db);
    const target = metrics.find((entry) => entry.cardLabel === "Umbreon VMAX 215");

    expect(target).toBeDefined();
    expect(target?.setName).toBe("Evolving Skies");
    expect(target?.gemRatePsa).toBeCloseTo(23, 2);
    expect(target?.gemRateBlended).toBeCloseTo(23.1, 1);
  });

  it("calculates set total value from card raw prices", () => {
    const db = createSeedDatabase();
    const metrics = cardMetrics(db);
    const sets = setMetrics(db, metrics);
    const evolvingSkiesSet = db.sets.find((entry) => entry.code === "swsh7");
    const evolvingSkiesMetrics = evolvingSkiesSet
      ? metrics.filter((entry) => entry.setId === evolvingSkiesSet.id)
      : [];
    const expected = Number(
      evolvingSkiesMetrics
        .reduce((sum, entry) => sum + entry.rawPrice, 0)
        .toFixed(2),
    );
    const actual = sets.find((entry) => entry.code === "swsh7")?.totalSetValue;

    expect(actual).toBe(expected);
  });

  it("builds index series in chronological order", () => {
    const db = createSeedDatabase();
    const points = cardIndexSeries(db);

    expect(points.length).toBeGreaterThan(8);
    expect(points[0].date < points[points.length - 1].date).toBe(true);
    expect(points.every((entry) => entry.value > 0)).toBe(true);
  });

  it("builds dashboard summary counts", () => {
    const db = createSeedDatabase();
    const summary = dashboard(db);

    expect(summary.totalTrackedCards).toBe(db.cards.length);
    expect(summary.totalSets).toBe(db.sets.length);
    expect(summary.cardIndex.length).toBe(0);
    expect(summary.dataQuality.status).toBe("SEEDED");
    expect(summary.dataQuality.investmentMetricsReady).toBe(false);
    expect(summary.dataQuality.blockingReason).toContain("Investment metrics are hidden");
  });
});
