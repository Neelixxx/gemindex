import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { plusDays, subscriptionStatus, subscriptionTier } from "./entitlements";
import { logger } from "./logger";
import { createSeedDatabase } from "./seed-data";
import { hasPostgresUrl, prismaClient } from "./prisma";
import type {
  GemIndexDatabase,
  SyncJobRecord,
  UserRecord,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "gemindex-db.json");
const STATE_ID = "main";
const DEFAULT_PASSWORD_HASH = "$2b$10$XQr.sXlDCUQJhWKiJWPdiOzUR7RvrEq11V9damPhOQ16tp4suEiPe";

let cache: GemIndexDatabase | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();
let postgresUnavailable = false;

function shouldUsePostgres(): boolean {
  return hasPostgresUrl() && !postgresUnavailable;
}

function markPostgresUnavailable(error: unknown, phase: string): void {
  if (postgresUnavailable) {
    return;
  }
  postgresUnavailable = true;
  logger.warn(
    {
      phase,
      error: error instanceof Error ? error.message : String(error),
    },
    "postgres unavailable; falling back to file storage",
  );
}

function normalizeUser(rawUser: unknown, index: number): UserRecord {
  const source = (rawUser ?? {}) as Partial<UserRecord> & { email?: string };
  const createdAt = source.createdAt ?? new Date().toISOString();
  const role = source.role ?? (index === 0 ? "ADMIN" : "USER");
  const fallbackEmail =
    index === 0
      ? "demo@gemindex.local"
      : `${(source.name ?? `user${index + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, "") || "user"}@gemindex.local`;
  const defaultTier = role === "ADMIN" ? "ELITE" : "FREE";
  const defaultStatus = role === "ADMIN" ? "ACTIVE" : "TRIALING";

  return {
    id: source.id ?? `user_${index + 1}`,
    name: source.name ?? `User ${index + 1}`,
    email: source.email ?? fallbackEmail,
    passwordHash: source.passwordHash ?? DEFAULT_PASSWORD_HASH,
    role,
    subscriptionTier: source.subscriptionTier ?? defaultTier,
    subscriptionStatus: source.subscriptionStatus ?? defaultStatus,
    subscriptionCurrentPeriodEnd:
      source.subscriptionCurrentPeriodEnd ??
      (role === "ADMIN" ? plusDays(new Date(createdAt), 365) : plusDays(new Date(createdAt), 14)),
    trialEndsAt: source.trialEndsAt ?? (role === "ADMIN" ? undefined : plusDays(new Date(createdAt), 14)),
    stripeCustomerId: source.stripeCustomerId,
    stripeSubscriptionId: source.stripeSubscriptionId,
    emailVerified: source.emailVerified ?? index === 0,
    emailVerifiedAt: source.emailVerifiedAt,
    totpEnabled: source.totpEnabled ?? false,
    totpSecret: source.totpSecret,
    createdAt,
    updatedAt: source.updatedAt ?? createdAt,
  };
}

function mergeDefaultJobs(existing: SyncJobRecord[], fallback: SyncJobRecord[]): SyncJobRecord[] {
  const out = [...existing];

  fallback.forEach((job) => {
    const already = out.find((entry) => entry.id === job.id || entry.type === job.type);
    if (!already) {
      out.push(job);
      return;
    }

    if (already.intervalMinutes <= 0) {
      already.intervalMinutes = job.intervalMinutes;
    }
    if (!already.nextRunAt) {
      already.nextRunAt = job.nextRunAt;
    }
    if (typeof already.running !== "boolean") {
      already.running = false;
    }
    if (!already.name) {
      already.name = job.name;
    }
    if (!already.options) {
      already.options = job.options;
    }
  });

  return out;
}

function normalizeDb(raw: unknown): GemIndexDatabase {
  const seed = createSeedDatabase();
  const incoming = (raw ?? {}) as Partial<GemIndexDatabase>;

  const usersRaw = Array.isArray(incoming.users) ? incoming.users : [];
  const users = usersRaw.length ? usersRaw.map(normalizeUser) : seed.users;

  const result: GemIndexDatabase = {
    version: 4,
    sets: Array.isArray(incoming.sets) ? incoming.sets : seed.sets,
    cards: Array.isArray(incoming.cards) ? incoming.cards : seed.cards,
    populationReports: Array.isArray(incoming.populationReports)
      ? incoming.populationReports
      : seed.populationReports,
    sales: Array.isArray(incoming.sales) ? incoming.sales : seed.sales,
    users,
    emailVerificationTokens: Array.isArray(incoming.emailVerificationTokens)
      ? incoming.emailVerificationTokens
      : [],
    passwordResetTokens: Array.isArray(incoming.passwordResetTokens)
      ? incoming.passwordResetTokens
      : [],
    emailOutbox: Array.isArray(incoming.emailOutbox) ? incoming.emailOutbox : [],
    syncJobs: mergeDefaultJobs(
      Array.isArray(incoming.syncJobs) ? incoming.syncJobs : [],
      seed.syncJobs,
    ),
    syncTasks: Array.isArray(incoming.syncTasks) ? incoming.syncTasks : [],
    collectionItems: Array.isArray(incoming.collectionItems)
      ? incoming.collectionItems
      : seed.collectionItems,
    wishlistItems: Array.isArray(incoming.wishlistItems)
      ? incoming.wishlistItems
      : seed.wishlistItems,
    sealedInventoryItems: Array.isArray(incoming.sealedInventoryItems)
      ? incoming.sealedInventoryItems
      : seed.sealedInventoryItems,
    sealedWishlistItems: Array.isArray(incoming.sealedWishlistItems)
      ? incoming.sealedWishlistItems
      : seed.sealedWishlistItems,
    scanEvents: Array.isArray(incoming.scanEvents) ? incoming.scanEvents : seed.scanEvents,
    sync: incoming.sync ?? {},
  };

  const hasTcgCreds =
    Boolean(process.env.TCGPLAYER_PUBLIC_KEY) &&
    Boolean(process.env.TCGPLAYER_PRIVATE_KEY);
  if (!hasTcgCreds) {
    result.syncJobs = result.syncJobs.map((job) =>
      job.type === "TCGPLAYER_DIRECT_SYNC" ? { ...job, enabled: false } : job,
    );
  }

  const validUserIds = new Set(result.users.map((user) => user.id));
  const fallbackUserId = result.users[0]?.id ?? "user_default";

  const nowIso = new Date().toISOString();
  result.users = result.users.map((user) => {
    const tier = subscriptionTier(user);
    const trialEndsAt =
      user.trialEndsAt ?? (user.role === "ADMIN" ? undefined : plusDays(new Date(user.createdAt), 14));
    const currentPeriodEnd =
      user.subscriptionCurrentPeriodEnd ??
      (user.role === "ADMIN" ? plusDays(new Date(user.createdAt), 365) : plusDays(new Date(user.createdAt), 14));

    let status = subscriptionStatus(user);
    if (status === "TRIALING" && trialEndsAt && trialEndsAt <= nowIso) {
      status = "PAST_DUE";
    }

    return {
      ...user,
      subscriptionTier: tier,
      subscriptionStatus: status,
      trialEndsAt,
      subscriptionCurrentPeriodEnd: currentPeriodEnd,
    };
  });

  result.collectionItems = result.collectionItems.map((item) => ({
    ...item,
    userId: validUserIds.has(item.userId) ? item.userId : fallbackUserId,
  }));
  result.wishlistItems = result.wishlistItems.map((item) => ({
    ...item,
    userId: validUserIds.has(item.userId) ? item.userId : fallbackUserId,
  }));
  result.sealedInventoryItems = result.sealedInventoryItems.map((item) => ({
    ...item,
    userId: validUserIds.has(item.userId) ? item.userId : fallbackUserId,
  }));
  result.sealedWishlistItems = result.sealedWishlistItems.map((item) => ({
    ...item,
    userId: validUserIds.has(item.userId) ? item.userId : fallbackUserId,
  }));
  result.scanEvents = result.scanEvents.map((item) => ({
    ...item,
    userId: validUserIds.has(item.userId) ? item.userId : fallbackUserId,
  }));
  result.emailVerificationTokens = result.emailVerificationTokens.filter((item) =>
    validUserIds.has(item.userId),
  );
  result.passwordResetTokens = result.passwordResetTokens.filter((item) =>
    validUserIds.has(item.userId),
  );

  return result;
}

async function ensureFileDbExists(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(DB_FILE, "utf8");
  } catch {
    const seed = createSeedDatabase();
    await writeFile(DB_FILE, JSON.stringify(seed, null, 2), "utf8");
  }
}

async function ensurePostgresStateExists(): Promise<void> {
  const prisma = prismaClient();
  const existing = await prisma.appState.findUnique({ where: { id: STATE_ID } });
  if (existing) {
    return;
  }

  const seed = createSeedDatabase();
  await prisma.appState.create({
    data: {
      id: STATE_ID,
      version: seed.version,
      data: seed as unknown as object,
    },
  });
}

async function ensureStorageExists(): Promise<void> {
  if (shouldUsePostgres()) {
    try {
      await ensurePostgresStateExists();
      return;
    } catch (error) {
      markPostgresUnavailable(error, "ensure");
    }
  }

  await ensureFileDbExists();
}

async function readRawStorage(): Promise<unknown> {
  if (shouldUsePostgres()) {
    try {
      const prisma = prismaClient();
      const row = await prisma.appState.findUnique({ where: { id: STATE_ID } });
      return row?.data;
    } catch (error) {
      markPostgresUnavailable(error, "read");
      await ensureFileDbExists();
    }
  }

  const raw = await readFile(DB_FILE, "utf8");
  return JSON.parse(raw) as unknown;
}

async function writeRawStorage(db: GemIndexDatabase): Promise<void> {
  if (shouldUsePostgres()) {
    try {
      const prisma = prismaClient();
      await prisma.appState.upsert({
        where: { id: STATE_ID },
        update: {
          version: db.version,
          data: db as unknown as object,
        },
        create: {
          id: STATE_ID,
          version: db.version,
          data: db as unknown as object,
        },
      });
      return;
    } catch (error) {
      markPostgresUnavailable(error, "write");
    }
  }

  await ensureFileDbExists();
  await writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

export async function readDb(forceFresh = false): Promise<GemIndexDatabase> {
  await ensureStorageExists();

  if (!forceFresh && cache) {
    return cache;
  }

  const parsed = normalizeDb(await readRawStorage());
  cache = parsed;
  return parsed;
}

export async function writeDb(db: GemIndexDatabase): Promise<void> {
  const normalized = normalizeDb(db);
  cache = normalized;
  await writeRawStorage(normalized);
}

export async function withDbMutation<T>(
  mutate: (db: GemIndexDatabase) => Promise<T> | T,
): Promise<T> {
  writeQueue = writeQueue.then(async () => {
    const db = await readDb(true);
    const result = await mutate(db);
    await writeDb(db);
    return result;
  });

  return writeQueue as Promise<T>;
}

export function nextId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function storageMode(): "postgres" | "file" {
  return shouldUsePostgres() ? "postgres" : "file";
}
