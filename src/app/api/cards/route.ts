import { NextRequest, NextResponse } from "next/server";

import { cardMetrics, marketSeries } from "@/lib/analytics";
import { assessDataQuality } from "@/lib/data-quality";
import { readDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const db = await readDb();
  const dataQuality = assessDataQuality(db);
  const investmentMetricsReady = dataQuality.investmentMetricsReady;
  const params = request.nextUrl.searchParams;
  const setId = params.get("setId");

  const metrics = cardMetrics(db)
    .filter((item) => (setId ? item.setId === setId : true))
    .map((item) => {
      const card = db.cards.find((entry) => entry.id === item.cardId);
      const set = db.sets.find((entry) => entry.id === item.setId);
      return {
        ...item,
        rawPrice: investmentMetricsReady ? item.rawPrice : 0,
        psa10Price: investmentMetricsReady ? item.psa10Price : 0,
        tag10Price: investmentMetricsReady ? item.tag10Price : 0,
        liquidityScore: investmentMetricsReady ? item.liquidityScore : 0,
        scarcityScore: investmentMetricsReady ? item.scarcityScore : 0,
        roi12m: investmentMetricsReady ? item.roi12m : 0,
        gradingArbitrageUsd: investmentMetricsReady ? item.gradingArbitrageUsd : 0,
        cardName: card?.name ?? item.cardLabel,
        cardNumber: card?.cardNumber ?? "",
        setCode: set?.code ?? "",
        series: investmentMetricsReady ? marketSeries(db, item.cardId) : [],
      };
    });

  return NextResponse.json({ items: metrics, dataQuality });
}
