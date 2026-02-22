import { cardIndexSeries, cardMetrics } from "@/lib/analytics";
import { readDb } from "@/lib/db";
import { requireServerFeature } from "@/lib/server-auth";
import { AnalyticsNav } from "@/components/analytics-nav";

export const dynamic = "force-dynamic";

function usd(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default async function PortfolioPerformancePage() {
  const user = await requireServerFeature("PORTFOLIO_TRACKING");
  const db = await readDb();
  const metrics = cardMetrics(db);
  const metricByCard = new Map(metrics.map((entry) => [entry.cardId, entry]));

  const rows = db.collectionItems
    .filter((item) => item.userId === user?.id)
    .map((item) => {
      const metric = metricByCard.get(item.cardId);
      const marketEach =
        item.ownershipType === "GRADED" && item.grader === "PSA"
          ? (metric?.psa10Price ?? 0)
          : item.ownershipType === "GRADED" && item.grader === "TAG"
            ? (metric?.tag10Price ?? 0)
            : (metric?.rawPrice ?? 0);

      const marketValue = marketEach * item.quantity;
      const costBasis = (item.acquisitionPriceUsd ?? 0) * item.quantity;
      const pnl = marketValue - costBasis;

      const card = db.cards.find((entry) => entry.id === item.cardId);
      const set = card ? db.sets.find((entry) => entry.id === card.setId) : null;

      return {
        id: item.id,
        label: `${card?.name ?? "Unknown"} ${card?.cardNumber ?? ""} (${set?.code?.toUpperCase() ?? "N/A"})`,
        quantity: item.quantity,
        marketEach,
        marketValue,
        costBasis,
        pnl,
      };
    });

  const portfolioValue = rows.reduce((sum, row) => sum + row.marketValue, 0);
  const costBasis = rows.reduce((sum, row) => sum + row.costBasis, 0);
  const pnl = portfolioValue - costBasis;

  const sealedValue = db.sealedInventoryItems
    .filter((item) => item.userId === user?.id)
    .reduce((sum, item) => sum + (item.estimatedValueUsd ?? 0) * item.quantity, 0);

  const index = cardIndexSeries(db);
  const indexStart = index[0]?.value ?? 100;
  const indexEnd = index[index.length - 1]?.value ?? 100;
  const benchmarkRoi = ((indexEnd - indexStart) / indexStart) * 100;
  const portfolioRoi = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4 sm:p-8">
      <AnalyticsNav />
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-semibold">Portfolio Performance</h1>
        <p className="text-sm text-slate-600">Cost basis, mark-to-market P/L, and benchmark versus Card Index.</p>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">Collection MV: {usd(portfolioValue)}</div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">Sealed MV: {usd(sealedValue)}</div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">Cost Basis: {usd(costBasis)}</div>
        <div className={`rounded-xl border border-slate-200 bg-white p-3 text-sm ${pnl >= 0 ? "text-emerald-700" : "text-rose-700"}`}>P/L: {usd(pnl)}</div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">Portfolio ROI {portfolioRoi.toFixed(2)}% | Index ROI {benchmarkRoi.toFixed(2)}%</div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Position Detail</h2>
        <div className="max-h-[70vh] overflow-auto text-sm">
          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] border-b py-1">
              <span>{row.label}</span>
              <span>x{row.quantity}</span>
              <span>{usd(row.marketValue)}</span>
              <span>{usd(row.costBasis)}</span>
              <span className={row.pnl >= 0 ? "text-emerald-700" : "text-rose-700"}>{usd(row.pnl)}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
