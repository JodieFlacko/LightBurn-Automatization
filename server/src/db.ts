import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config, IS_WSL } from "./config.js";

// Use the centralized config for database path (in AppData)
const dbPath = config.paths.db;

const sqlite = new Database(dbPath);

// WAL mode requires shared-memory files (.shm) which are unsupported on WSL DrvFs
// mounts (/mnt/c/...). Fall back to DELETE journal mode in that environment.
// In production (native Windows / Electron) we use WAL for concurrent read/write.
if (IS_WSL) {
  sqlite.pragma('journal_mode = DELETE');
} else {
  sqlite.pragma('journal_mode = WAL');
}

export const db = drizzle(sqlite);
