import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { readDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await readDb();
  return NextResponse.json({
    emails: db.emailOutbox.slice(-30).reverse(),
  });
}
