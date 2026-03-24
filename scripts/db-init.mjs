import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const databaseUrl =
  process.env.DATABASE_URL ?? `file:${path.resolve(cwd, "prisma", "dev.db").replace(/\\/g, "/")}`;

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
};

if (databaseUrl.startsWith("file:")) {
  const sqlitePath = databaseUrl.slice("file:".length);
  const resolvedSqlitePath = path.isAbsolute(sqlitePath)
    ? sqlitePath
    : path.resolve(cwd, sqlitePath);

  fs.mkdirSync(path.dirname(resolvedSqlitePath), { recursive: true });
  if (fs.existsSync(resolvedSqlitePath)) {
    try {
      fs.unlinkSync(resolvedSqlitePath);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "EBUSY") {
        process.stderr.write(
          `Database file is locked: ${resolvedSqlitePath}. Stop running API/dev servers and retry.\n`,
        );
        process.exit(1);
      }

      throw error;
    }
  }
}

let diffSql = "";
try {
  diffSql = execSync(
    "npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script",
    {
      cwd,
      env,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    },
  );
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exit(1);
}

if (!diffSql.trim()) {
  process.stderr.write("Failed to generate SQL diff.\n");
  process.exit(1);
}

const sqlFile = path.resolve(cwd, "prisma", ".init.sql");
fs.writeFileSync(sqlFile, diffSql, "utf8");

try {
  execSync(`npx prisma db execute --url \"${databaseUrl}\" --file \"${sqlFile}\"`, {
    cwd,
    env,
    stdio: "inherit",
  });
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exit(1);
} finally {
  try {
    fs.unlinkSync(sqlFile);
  } catch {
    // best-effort cleanup
  }
}

process.stdout.write(`Database initialized at ${databaseUrl}\n`);
