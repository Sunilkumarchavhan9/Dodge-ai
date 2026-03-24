import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) {
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

try {
  ensureDatabaseUrl();
  run("npm run prisma:sync");

  if (shouldSeedDataset()) {
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
