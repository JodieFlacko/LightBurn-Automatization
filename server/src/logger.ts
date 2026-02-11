import pino from "pino";
import path from "node:path";
import { config } from "./config.js";

// Use the centralized config for logs directory (in AppData)
const logsDir = config.paths.logs;

// Determine if we're in development mode
const isDevelopment = process.env.NODE_ENV !== "production";

/**
 * Create a Pino logger instance with both console (pretty) and file transports
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isDevelopment
    ? {
        targets: [
          {
            target: "pino-pretty",
            level: "info",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname",
              singleLine: false,
            },
          },
          {
            target: "pino/file",
            level: "info",
            options: {
              destination: path.join(logsDir, "app.log"),
              mkdir: true,
            },
          },
        ],
      }
    : {
        targets: [
          {
            target: "pino/file",
            level: "info",
            options: {
              destination: path.join(logsDir, "app.log"),
              mkdir: true,
            },
          },
        ],
      },
});

/**
 * Helper to log errors with full context
 * @param error - The error object
 * @param context - Additional context
 */
export function logError(error: unknown, context?: Record<string, unknown>) {
  if (error instanceof Error) {
    logger.error(
      {
        ...context,
        err: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      },
      error.message
    );
  } else {
    logger.error({ ...context, err: error }, "Unknown error occurred");
  }
}
