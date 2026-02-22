import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { confirmPasswordReset } from "@/lib/account-recovery";
import { createSessionToken, publicUser, setSessionCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(12),
  newPassword: z.string().min(8).max(120),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = checkRateLimit({
    key: `pwd-reset-confirm:${ip}`,
    limit: 12,
    windowMs: 60 * 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Retry in ${rl.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }

  const json = await request.json().catch(() => ({}));
  const parse = schema.safeParse(json);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  const user = await confirmPasswordReset(parse.data.token.trim(), parse.data.newPassword);
  if (!user) {
    return NextResponse.json({ error: "Invalid or expired reset token." }, { status: 400 });
  }

  const token = await createSessionToken(user);
  const response = NextResponse.json({ user: publicUser(user) });
  setSessionCookie(response, token);
  return response;
}
