import { NextResponse } from "next/server";

import { dashboard } from "@/lib/analytics";
import { readDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const db = await readDb();
  return NextResponse.json({
    ...dashboard(db),
    sync: db.sync,
  });
}
