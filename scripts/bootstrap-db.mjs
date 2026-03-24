import { execSync } from "node:child_process";
import fs from "node:fs";

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
