import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config } from "./config.js";

// Use the centralized config for database path (in AppData)
const dbPath = config.paths.db;

const sqlite = new Database(dbPath);

// Enable Write-Ahead Logging for concurrent read/write operations
// This allows the UI to query while background hydration writes data
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite);
