import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString || !connectionString.startsWith("postgres")) {
  throw new Error("Set DATABASE_URL to a postgres connection string before running import.");
}

const source = process.argv[2] ?? path.join(process.cwd(), "data", "gemindex-db.json");
const raw = await readFile(source, "utf8");
const parsed = JSON.parse(raw) as object;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

await prisma.appState.upsert({
  where: { id: "main" },
  update: {
    version: 3,
    data: parsed,
  },
  create: {
    id: "main",
    version: 3,
    data: parsed,
  },
});

console.log(`Imported ${source} into AppState(main).`);

await prisma.$disconnect();
