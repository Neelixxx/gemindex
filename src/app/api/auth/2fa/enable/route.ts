import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { readDb, withDbMutation } from "@/lib/db";
import { verifyTotpToken } from "@/lib/totp";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().length(6),
});

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = (await requireAdmin(request)).id;
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => ({}));
  const parse = schema.safeParse(json);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  const db = await readDb();
  const user = db.users.find((entry) => entry.id === userId);
  if (!user?.totpSecret) {
    return NextResponse.json({ error: "Run 2FA setup first." }, { status: 400 });
  }

  const ok = verifyTotpToken(user.totpSecret, parse.data.code);
  if (!ok) {
    return NextResponse.json({ error: "Invalid 2FA code." }, { status: 400 });
  }

  await withDbMutation((mutable) => {
    const row = mutable.users.find((entry) => entry.id === userId);
    if (!row) {
      return;
    }
    row.totpEnabled = true;
    row.updatedAt = new Date().toISOString();
  });

  return NextResponse.json({ ok: true });
}
