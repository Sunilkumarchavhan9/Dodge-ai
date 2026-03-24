import { ALLOWED_TABLES } from "./schemaContext";

export type SqlValidationResult = {
  isValid: boolean;
  safeSql?: string;
  reason?: string;
};

const FORBIDDEN_SQL_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "create",
  "truncate",
  "attach",
  "detach",
  "pragma",
  "vacuum",
  "replace",
  "reindex",
  "grant",
  "revoke",
];

function extractReferencedTables(sql: string): string[] {
  const tables = new Set<string>();
  const regex = /\b(?:from|join)\s+(?:"|`|\[)?([a-zA-Z_][a-zA-Z0-9_]*)(?:"|`|\])?/gi;

  let match: RegExpExecArray | null = regex.exec(sql);
  while (match) {
    tables.add(match[1].toLowerCase());
    match = regex.exec(sql);
  }

  return [...tables];
}

function extractCteNames(sql: string): Set<string> {
  const cteNames = new Set<string>();
  const cteRegex = /\bwith\b\s+(?:recursive\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s+as\s*\(|,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+as\s*\(/gi;

  let match: RegExpExecArray | null = cteRegex.exec(sql);
  while (match) {
    const name = (match[1] ?? match[2])?.toLowerCase();
    if (name) {
      cteNames.add(name);
    }

    match = cteRegex.exec(sql);
  }

  return cteNames;
}

function clampLimit(sql: string): string {
  const limitRegex = /\blimit\s+(\d+)\b/i;
  const match = sql.match(limitRegex);

  if (!match) {
    return `${sql} LIMIT 200`;
  }

  const currentLimit = Number.parseInt(match[1], 10);
  if (Number.isNaN(currentLimit) || currentLimit <= 200) {
    return sql;
  }

  return sql.replace(limitRegex, "LIMIT 200");
}

export function validateSql(sql: string): SqlValidationResult {
  const trimmed = sql.trim().replace(/;$/, "").trim();

  if (!trimmed) {
    return { isValid: false, reason: "SQL is empty" };
  }

  if (!/^(select\b|with\b)/i.test(trimmed)) {
    return { isValid: false, reason: "Only SELECT queries are allowed (including CTE + SELECT)" };
  }

  if (!/\bselect\b/i.test(trimmed)) {
    return { isValid: false, reason: "Query must include a SELECT statement" };
  }

  if (trimmed.includes(";") || /--|\/\*|\*\//.test(trimmed)) {
    return { isValid: false, reason: "Multiple statements or SQL comments are not allowed" };
  }

  const lowered = trimmed.toLowerCase();
  if (FORBIDDEN_SQL_KEYWORDS.some((keyword) => new RegExp(`\\b${keyword}\\b`, "i").test(lowered))) {
    return { isValid: false, reason: "Query contains forbidden SQL operations" };
  }

  const referencedTables = extractReferencedTables(trimmed);
  if (referencedTables.length === 0) {
    return { isValid: false, reason: "Query must reference at least one allowed table" };
  }

  const cteNames = extractCteNames(trimmed);
  const referencedPhysicalTables = referencedTables.filter((table) => !cteNames.has(table));
  if (referencedPhysicalTables.length === 0) {
    return { isValid: false, reason: "Query must reference at least one physical allowed table" };
  }

  const allowedTableSet = new Set(ALLOWED_TABLES.map((table) => table.toLowerCase()));
  if (referencedPhysicalTables.some((table) => !allowedTableSet.has(table))) {
    return { isValid: false, reason: "Query references tables outside the allowed schema" };
  }

  return {
    isValid: true,
    safeSql: clampLimit(trimmed),
  };
}
