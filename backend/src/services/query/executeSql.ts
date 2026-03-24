import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Prisma.Decimal) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }

  if (typeof value === "object") {
    const asRecord = value as Record<string, unknown>;
    const normalizedEntries = Object.entries(asRecord).map(([key, entryValue]) => [
      key,
      normalizeValue(entryValue),
    ]);
    return Object.fromEntries(normalizedEntries);
  }

  return value;
}

export async function executeSql(sql: string): Promise<Record<string, unknown>[]> {
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql);
  return rows.map((row) => normalizeValue(row) as Record<string, unknown>);
}
