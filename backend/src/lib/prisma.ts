import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

function resolveDefaultDatabaseUrl(): string {
  const filePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(filePath);
  const databasePath = path.resolve(currentDir, "../../../prisma/dev.db").replace(/\\/g, "/");
  return `file:${databasePath}`;
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolveDefaultDatabaseUrl();
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
