import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function normalizeDatabaseUrl(url) {
  if (!url.startsWith("file:")) {
    return url;
  }

  const rawPath = url.slice("file:".length);
  if (!rawPath) {
    return url;
  }

  const absolutePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
  return `file:${absolutePath.replace(/\\/g, "/")}`;
}

function ensureDatabaseUrl() {
  const configuredUrl = process.env.DATABASE_URL?.trim();

  if (configuredUrl) {
    process.env.DATABASE_URL = normalizeDatabaseUrl(configuredUrl);
    return;
  }

  const sqlitePath = path.resolve(process.cwd(), "prisma", "dev.db").replace(/\\/g, "/");
  process.env.DATABASE_URL = `file:${sqlitePath}`;
  console.log(`DATABASE_URL not provided. Falling back to ${process.env.DATABASE_URL}`);
}

function run(command) {
  execSync(command, {
    stdio: "inherit",
    env: process.env,
  });
}

function shouldSeedDataset() {
  const datasetDir = process.env.SAP_O2C_DATASET_DIR;
  return Boolean(datasetDir && fs.existsSync(datasetDir) && fs.statSync(datasetDir).isDirectory());
}

function resolveSqlitePathFromUrl(databaseUrl) {
  if (!databaseUrl || !databaseUrl.startsWith("file:")) {
    return null;
  }

  const rawPath = databaseUrl.slice("file:".length);
  if (!rawPath) {
    return null;
  }

  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
}

function hydrateFromBundledSeedIfNeeded() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const targetPath = resolveSqlitePathFromUrl(databaseUrl);
  if (!targetPath) {
    return;
  }

  const bundledSeedPath = path.resolve(process.cwd(), "prisma", "railway-seed.db");
  if (!fs.existsSync(bundledSeedPath)) {
    return;
  }

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(bundledSeedPath, targetPath);
  console.log(`Hydrated SQLite database from bundled seed: ${bundledSeedPath}`);
}

try {
  ensureDatabaseUrl();
  const hasDatasetDir = shouldSeedDataset();

  if (!hasDatasetDir) {
    hydrateFromBundledSeedIfNeeded();
  }

  run("npm run prisma:sync");

  if (hasDatasetDir) {
    run("npm run prisma:seed");
  } else {
    console.log(
      "Skipping prisma seed. Provide SAP_O2C_DATASET_DIR in runtime env if you want full dataset seeding.",
    );
  }
} catch (error) {
  console.error("Database bootstrap failed", error);
  process.exit(1);
}
