import "dotenv/config";
import path from "node:path";
import { runMigrations } from "./migrate.js";
import { syncOrders } from "./sync.js";

const source = process.env.SEED_SOURCE === "json" ? "sample.json" : "sample.csv";
const feedPath = path.resolve(process.cwd(), "sample-data", source);

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
