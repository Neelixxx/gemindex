import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { issuePasswordReset } from "@/lib/account-recovery";
import { readDb } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => ({}));
  const parse = schema.safeParse(json);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  const email = parse.data.email.trim().toLowerCase();
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = checkRateLimit({
    key: `pwd-reset-request:${ip}:${email}`,
    limit: 8,
    windowMs: 60 * 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Retry in ${rl.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }

  const db = await readDb();
  const user = db.users.find((entry) => entry.email.toLowerCase() === email);

  let debugToken: string | undefined;
  if (user) {
    debugToken = await issuePasswordReset(user);
  }

  return NextResponse.json({
    ok: true,
    ...(process.env.NODE_ENV !== "production" ? { debugToken } : {}),
  });
}
