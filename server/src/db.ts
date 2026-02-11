import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config } from "./config.js";

// Use the centralized config for database path (in AppData)
const dbPath = config.paths.db;

const sqlite = new Database(dbPath);

export const db = drizzle(sqlite);
