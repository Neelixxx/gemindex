import { hashPassword } from "./auth";
import { nextId, readDb, withDbMutation } from "./db";
import { queueEmail } from "./notifications";
import { addMinutes, createOpaqueToken, hashOpaqueToken } from "./token-utils";
import type { UserRecord } from "./types";

const EMAIL_VERIFY_MINUTES = 60 * 24;
const PASSWORD_RESET_MINUTES = 30;

export async function cleanupAuthTokens(): Promise<void> {
  const now = new Date().toISOString();

  await withDbMutation((db) => {
    db.emailVerificationTokens = db.emailVerificationTokens.filter(
      (token) => !token.consumedAt && token.expiresAt > now,
    );
    db.passwordResetTokens = db.passwordResetTokens.filter(
      (token) => !token.consumedAt && token.expiresAt > now,
    );
  });
}

export async function issueEmailVerification(user: UserRecord): Promise<string> {
  const token = createOpaqueToken(24);
  const tokenHash = hashOpaqueToken(token);
  const now = new Date();

  await withDbMutation((db) => {
    db.emailVerificationTokens = db.emailVerificationTokens.filter(
      (entry) => entry.userId !== user.id && !entry.consumedAt,
    );

    db.emailVerificationTokens.push({
      id: nextId("verify"),
      userId: user.id,
      email: user.email,
      tokenHash,
      expiresAt: addMinutes(now, EMAIL_VERIFY_MINUTES),
      createdAt: now.toISOString(),
    });
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const verifyUrl = `${appUrl}/?verify_token=${encodeURIComponent(token)}`;
  await queueEmail({
    userId: user.id,
    to: user.email,
    subject: "Verify your Gem Index email",
    template: "VERIFY_EMAIL",
    body: `Use this verification token: ${token}\n\nOr open: ${verifyUrl}`,
  });

  return token;
}

export async function confirmEmailVerification(token: string): Promise<UserRecord | null> {
  const tokenHash = hashOpaqueToken(token);
  const now = new Date().toISOString();

  let userId: string | undefined;
  await withDbMutation((db) => {
    const row = db.emailVerificationTokens.find(
      (entry) =>
        entry.tokenHash === tokenHash &&
        !entry.consumedAt &&
        entry.expiresAt > now,
    );

    if (!row) {
      return;
    }

    row.consumedAt = now;
    userId = row.userId;

    const user = db.users.find((entry) => entry.id === row.userId);
    if (user) {
      user.emailVerified = true;
      user.emailVerifiedAt = now;
      user.updatedAt = now;
    }
  });

  if (!userId) {
    return null;
  }

  const db = await readDb(true);
  return db.users.find((entry) => entry.id === userId) ?? null;
}

export async function issuePasswordReset(user: UserRecord): Promise<string> {
  const token = createOpaqueToken(24);
  const tokenHash = hashOpaqueToken(token);
  const now = new Date();

  await withDbMutation((db) => {
    db.passwordResetTokens = db.passwordResetTokens.filter(
      (entry) => entry.userId !== user.id && !entry.consumedAt,
    );

    db.passwordResetTokens.push({
      id: nextId("pwdreset"),
      userId: user.id,
      email: user.email,
      tokenHash,
      expiresAt: addMinutes(now, PASSWORD_RESET_MINUTES),
      createdAt: now.toISOString(),
    });
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const resetUrl = `${appUrl}/?reset_token=${encodeURIComponent(token)}`;

  await queueEmail({
    userId: user.id,
    to: user.email,
    subject: "Reset your Gem Index password",
    template: "PASSWORD_RESET",
    body: `Use this password reset token: ${token}\n\nOr open: ${resetUrl}`,
  });

  return token;
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<UserRecord | null> {
  const tokenHash = hashOpaqueToken(token);
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(newPassword);

  let userId: string | undefined;
  await withDbMutation((db) => {
    const row = db.passwordResetTokens.find(
      (entry) =>
        entry.tokenHash === tokenHash &&
        !entry.consumedAt &&
        entry.expiresAt > now,
    );

    if (!row) {
      return;
    }

    row.consumedAt = now;
    userId = row.userId;

    const user = db.users.find((entry) => entry.id === row.userId);
    if (user) {
      user.passwordHash = passwordHash;
      user.updatedAt = now;
    }
  });

  if (!userId) {
    return null;
  }

  const db = await readDb(true);
  return db.users.find((entry) => entry.id === userId) ?? null;
}
