import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./db.js";

export function runMigrations() {
  migrate(db, { migrationsFolder: "drizzle" });
}
