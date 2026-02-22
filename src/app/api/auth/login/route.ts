import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { issueEmailVerification } from "@/lib/account-recovery";
import { createSessionToken, publicUser, setSessionCookie, verifyPassword } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTotpToken } from "@/lib/totp";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  otp: z.string().length(6).optional(),
});

export async function POST(request: NextRequest) {
  const json = await request.json();
  const parse = loginSchema.safeParse(json);

  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  const email = parse.data.email.trim().toLowerCase();
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = checkRateLimit({
    key: `login:${ip}:${email}`,
    limit: 8,
    windowMs: 15 * 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Retry in ${rl.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }

  const db = await readDb();
  const user = db.users.find((entry) => entry.email.toLowerCase() === email);

  if (!user) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const isValid = await verifyPassword(parse.data.password, user.passwordHash);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  if (!user.emailVerified) {
    await issueEmailVerification(user);
    return NextResponse.json(
      { error: "Email not verified. A new verification email has been sent." },
      { status: 403 },
    );
  }

  if (user.role === "ADMIN" && user.totpEnabled && user.totpSecret) {
    if (!parse.data.otp) {
      return NextResponse.json(
        { error: "Two-factor code required.", requires2fa: true },
        { status: 403 },
      );
    }

    const ok = verifyTotpToken(user.totpSecret, parse.data.otp);
    if (!ok) {
      return NextResponse.json({ error: "Invalid two-factor code." }, { status: 401 });
    }
  }

  const token = await createSessionToken(user);
  const response = NextResponse.json({ user: publicUser(user) });
  setSessionCookie(response, token);
  return response;
}
