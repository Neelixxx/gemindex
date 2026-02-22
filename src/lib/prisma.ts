import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

let prismaSingleton: PrismaClient | null = null;

export function hasPostgresUrl(): boolean {
  return Boolean(connectionString && connectionString.startsWith("postgres"));
}

export function prismaClient(): PrismaClient {
  if (!hasPostgresUrl()) {
    throw new Error("DATABASE_URL is not configured for postgres.");
  }

  if (!prismaSingleton) {
    const adapter = new PrismaPg({ connectionString: connectionString as string });
    prismaSingleton = new PrismaClient({ adapter, log: ["error", "warn"] });
  }

  return prismaSingleton;
}
