import { dashboard } from "@/lib/analytics";
import { readDb } from "@/lib/db";
import { requireServerFeature } from "@/lib/server-auth";
import { AnalyticsNav } from "@/components/analytics-nav";

export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  await requireServerFeature("ADVANCED_ANALYTICS");
  const db = await readDb();
  const data = dashboard(db);
  const investmentMetricsReady = data.dataQuality.investmentMetricsReady;
  const recentTasks = db.syncTasks.slice(-30).reverse();

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4 sm:p-8">
      <AnalyticsNav />
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-semibold">Signals</h1>
        <p className="text-sm text-slate-600">Undervalued candidates, momentum flips, and sync run history.</p>
        {!investmentMetricsReady ? <p className="mt-2 text-sm text-amber-700">{data.dataQuality.blockingReason}</p> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Undervalued</h2>
          {investmentMetricsReady ? (
            <div className="space-y-2 text-sm">
              {data.topUndervalued.map((item) => (
                <div key={item.cardId} className="rounded border border-emerald-200 bg-emerald-50 p-2">
                  <p className="font-medium">{item.label}</p>
                  <p>{item.reason}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Undervalued alerts will appear when live data coverage is sufficient.</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Flipper Momentum</h2>
          {investmentMetricsReady ? (
            <div className="space-y-2 text-sm">
              {data.flipperSignals.map((item) => (
                <div key={item.cardId} className="rounded border border-amber-200 bg-amber-50 p-2">
                  <p className="font-medium">{item.label}</p>
                  <p>{item.reason}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Flipper signals are hidden until live market history is broad enough.</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Job and Sync History</h2>
        <div className="max-h-[50vh] overflow-auto text-xs">
          {recentTasks.map((task) => (
            <div key={task.id} className="grid grid-cols-[1fr_1fr_1fr_3fr] border-b py-1">
              <span>{task.type}</span>
              <span>{task.status}</span>
              <span>{new Date(task.createdAt).toLocaleString()}</span>
              <span>{task.resultSummary ?? task.error ?? "-"}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
