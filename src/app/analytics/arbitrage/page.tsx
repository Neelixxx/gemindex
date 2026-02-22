import { cardMetrics } from "@/lib/analytics";
import { readDb } from "@/lib/db";
import { requireServerFeature } from "@/lib/server-auth";
import { AnalyticsNav } from "@/components/analytics-nav";

export const dynamic = "force-dynamic";

export default async function ArbitragePage() {
  await requireServerFeature("ADVANCED_ANALYTICS");
  const db = await readDb();
  const rows = cardMetrics(db)
    .sort((a, b) => b.gradingArbitrageUsd - a.gradingArbitrageUsd)
    .slice(0, 100);

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4 sm:p-8">
      <AnalyticsNav />
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-semibold">Grading Arbitrage Opportunities</h1>
        <p className="text-sm text-slate-600">Expected edge from raw-to-PSA strategy based on gem-rate and pricing model.</p>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="max-h-[75vh] overflow-auto text-sm">
          {rows.map((item) => (
            <div key={item.cardId} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] border-b py-1">
              <span>{item.cardLabel}</span>
              <span>${item.rawPrice.toFixed(2)}</span>
              <span>${item.psa10Price.toFixed(2)}</span>
              <span>{item.gemRatePsa.toFixed(2)}%</span>
              <span className={item.gradingArbitrageUsd >= 0 ? "text-emerald-700" : "text-rose-700"}>
                ${item.gradingArbitrageUsd.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
