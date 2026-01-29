import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { runMigrations } from "./migrate.js";
import { syncOrders } from "./sync.js";

const sourceFromEnv = process.env.SEED_SOURCE;
const sampleDir = path.resolve(process.cwd(), "sample-data");
const resolveSample = (name: string) => path.join(sampleDir, name);

const preferred = sourceFromEnv === "json"
  ? "sample.json"
  : sourceFromEnv === "xml"
  ? "sample.xml"
  : sourceFromEnv === "csv"
  ? "sample.csv"
  : null;

let source = preferred;

if (!source) {
  const csvPath = resolveSample("sample.csv");
  const xmlPath = resolveSample("sample.xml");
  const jsonPath = resolveSample("sample.json");

  if (fs.existsSync(csvPath)) {
    source = "sample.csv";
  } else if (fs.existsSync(xmlPath)) {
    source = "sample.xml";
  } else if (fs.existsSync(jsonPath)) {
    source = "sample.json";
  } else {
    source = "sample.csv";
  }
}

const feedPath = resolveSample(source);

process.env.FEED_URL = feedPath;

runMigrations();

syncOrders()
  .then((result) => {
    console.log("Seed completed:", result);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
