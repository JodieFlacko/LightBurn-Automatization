import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./db.js";
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ESM shim for __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function runMigrations() {
  // Resolve migrations path dynamically:
  // - Production (Electron): Use ELECTRON_RESOURCES_PATH/drizzle
  // - Development: Use ../drizzle relative to compiled output (server/dist/src/)
  const migrationsPath = process.env.ELECTRON_RESOURCES_PATH 
    ? join(process.env.ELECTRON_RESOURCES_PATH, 'drizzle') 
    : join(__dirname, '..', '..', 'drizzle');
  
  migrate(db, { migrationsFolder: migrationsPath });
}
