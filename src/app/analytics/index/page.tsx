import { cardIndexSeries, cardMetrics } from "@/lib/analytics";
import { readDb } from "@/lib/db";
import { AnalyticsNav } from "@/components/analytics-nav";

export const dynamic = "force-dynamic";

export default async function IndexAnalyticsPage() {
  const db = await readDb();
  const metrics = cardMetrics(db);
  const index = cardIndexSeries(db);

  const totalRaw = metrics.reduce((sum, item) => sum + item.rawPrice, 0) || 1;
  const components = metrics
    .map((item) => ({
      ...item,
      weightPct: (item.rawPrice / totalRaw) * 100,
    }))
    .sort((a, b) => b.weightPct - a.weightPct)
    .slice(0, 40);

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4 sm:p-8">
      <AnalyticsNav />
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-semibold">Card Index Components</h1>
        <p className="text-sm text-slate-600">Latest index level: {index[index.length - 1]?.value ?? 0}</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Top Weights</h2>
        <div className="max-h-[70vh] overflow-auto text-sm">
          {components.map((item) => (
            <div key={item.cardId} className="grid grid-cols-[2fr_1fr_1fr_1fr] border-b py-1">
              <span>{item.cardLabel}</span>
              <span>${item.rawPrice.toFixed(2)}</span>
              <span>{item.weightPct.toFixed(2)}%</span>
              <span>{item.roi12m.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
