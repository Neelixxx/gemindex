import { NextResponse } from "next/server";

import { setMetrics } from "@/lib/analytics";
import { readDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const db = await readDb();
  return NextResponse.json({
    items: setMetrics(db),
    catalog: db.sets,
  });
}
