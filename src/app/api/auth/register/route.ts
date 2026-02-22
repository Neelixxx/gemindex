import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword, publicUser } from "@/lib/auth";
import { issueEmailVerification } from "@/lib/account-recovery";
import { nextId, withDbMutation } from "@/lib/db";
import { plusDays } from "@/lib/entitlements";
import { checkRateLimit } from "@/lib/rate-limit";
import type { UserRecord } from "@/lib/types";

export const runtime = "nodejs";

const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(160),
  password: z.string().min(8).max(120),
});

export async function POST(request: NextRequest) {
  const json = await request.json();
  const parse = registerSchema.safeParse(json);

  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  const payload = parse.data;
  const email = payload.email.trim().toLowerCase();
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = checkRateLimit({
    key: `register:${ip}:${email}`,
    limit: 6,
    windowMs: 60 * 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many registrations. Retry in ${rl.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }

  const passwordHash = await hashPassword(payload.password);

  let createdUser: UserRecord;

  try {
    createdUser = await withDbMutation((db) => {
      const exists = db.users.some((user) => user.email.toLowerCase() === email);
      if (exists) {
        throw new Error("EMAIL_EXISTS");
      }

      const role = db.users.length === 0 ? "ADMIN" : "USER";
      const now = new Date().toISOString();
      const nextUser: UserRecord = {
        id: nextId("user"),
        name: payload.name.trim(),
        email,
        passwordHash,
        role,
        subscriptionTier: role === "ADMIN" ? "ELITE" : "FREE",
        subscriptionStatus: role === "ADMIN" ? "ACTIVE" : "TRIALING",
        subscriptionCurrentPeriodEnd:
          role === "ADMIN"
            ? plusDays(new Date(now), 365)
            : plusDays(new Date(now), 14),
        trialEndsAt: role === "ADMIN" ? undefined : plusDays(new Date(now), 14),
        emailVerified: role === "ADMIN",
        emailVerifiedAt: role === "ADMIN" ? now : undefined,
        createdAt: now,
        updatedAt: now,
      };

      db.users.push(nextUser);
      return nextUser;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_EXISTS") {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }

    return NextResponse.json({ error: "Could not create account." }, { status: 500 });
  }

  let debugVerificationToken: string | undefined;
  if (!createdUser.emailVerified) {
    debugVerificationToken = await issueEmailVerification(createdUser);
  }

  return NextResponse.json(
    {
      user: publicUser(createdUser),
      requiresEmailVerification: !createdUser.emailVerified,
      ...(process.env.NODE_ENV !== "production" ? { debugVerificationToken } : {}),
    },
    { status: 201 },
  );
}
