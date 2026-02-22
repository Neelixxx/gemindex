import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { readSessionToken, SESSION_COOKIE_NAME } from "./auth";
import { readDb } from "./db";
import { featureErrorMessage, hasFeature, type FeatureKey } from "./entitlements";
import type { UserRecord } from "./types";

export async function serverUser(): Promise<UserRecord | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const payload = await readSessionToken(token);
  if (!payload?.sub) {
    return null;
  }

  const db = await readDb();
  return db.users.find((entry) => entry.id === payload.sub) ?? null;
}

export async function requireServerUser(): Promise<UserRecord> {
  const user = await serverUser();
  if (!user) {
    redirect("/");
  }
  return user;
}

export async function requireServerFeature(feature: FeatureKey): Promise<UserRecord> {
  const user = await requireServerUser();
  if (!hasFeature(user, feature)) {
    const message = encodeURIComponent(featureErrorMessage(user, feature));
    redirect(`/?upgrade_error=${message}`);
  }
  return user;
}
