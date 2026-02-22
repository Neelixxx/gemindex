import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

import { readDb } from "./db";
import { subscriptionStatus, subscriptionTier } from "./entitlements";
import type { PublicUser, UserRecord, UserRole } from "./types";

const SESSION_COOKIE = "gemindex_session";
export const SESSION_COOKIE_NAME = SESSION_COOKIE;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const FALLBACK_SESSION_SECRET = "gemindex-dev-session-secret-change-me";

type SessionPayload = {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
};

function sessionSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET ?? FALLBACK_SESSION_SECRET;
  return new TextEncoder().encode(raw);
}

export function publicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    subscriptionTier: subscriptionTier(user),
    subscriptionStatus: subscriptionStatus(user),
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd,
    trialEndsAt: user.trialEndsAt,
    emailVerified: user.emailVerified,
    totpEnabled: user.totpEnabled ?? false,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(user: UserRecord): Promise<string> {
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionSecret());
}

export async function readSessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    if (!payload.sub || !payload.email || !payload.name || !payload.role) {
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

export async function getAuthenticatedUser(request: NextRequest): Promise<UserRecord | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const payload = await readSessionToken(token);
  if (!payload) {
    return null;
  }

  const db = await readDb();
  const user = db.users.find((entry) => entry.id === payload.sub);
  return user ?? null;
}

export async function requireUser(request: NextRequest): Promise<UserRecord> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function requireAdmin(request: NextRequest): Promise<UserRecord> {
  const user = await requireUser(request);
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}
