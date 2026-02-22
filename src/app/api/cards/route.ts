import { NextRequest, NextResponse } from "next/server";

import { cardMetrics, marketSeries } from "@/lib/analytics";
import { readDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const db = await readDb();
  const params = request.nextUrl.searchParams;
  const setId = params.get("setId");

  const metrics = cardMetrics(db)
    .filter((item) => (setId ? item.setId === setId : true))
    .map((item) => {
      const card = db.cards.find((entry) => entry.id === item.cardId);
      const set = db.sets.find((entry) => entry.id === item.setId);
      return {
        ...item,
        cardName: card?.name ?? item.cardLabel,
        cardNumber: card?.cardNumber ?? "",
        setCode: set?.code ?? "",
        series: marketSeries(db, item.cardId),
      };
    });

  return NextResponse.json({ items: metrics });
}
