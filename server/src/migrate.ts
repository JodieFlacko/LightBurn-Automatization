import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./db.js";
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ESM shim for __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function runMigrations() {
  migrate(db, { migrationsFolder: join(__dirname, '../drizzle') });
}
