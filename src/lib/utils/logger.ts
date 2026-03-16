/**
 * Lightweight file logger.
 *
 * Appends newline-delimited JSON (NDJSON) to `logs/<name>.log`.
 * Safe to use in Next.js API routes / server actions (Node.js runtime only).
 *
 * Usage:
 *   import { createLogger } from "@/lib/utils/logger";
 *   const log = createLogger("whatsapp");
 *   log.info("message", { extra: "context" });
 */

import fs from "fs";
import os from "os";
import path from "path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  logger: string;
  message: string;
  [key: string]: unknown;
}

const LOG_DIR_CANDIDATES = [
  path.resolve(process.cwd(), "logs"),
  path.join(os.tmpdir(), "travel-claim", "logs"),
];

let cachedLogDir: string | null | undefined;

/**
 * Resolve a writable log directory.
 *
 * Some deployments run from a read-only app directory (for example `/app` in
 * containers), so creating `process.cwd()/logs` can fail with EACCES.
 */
function getWritableLogDir(): string | null {
  if (cachedLogDir !== undefined) {
    return cachedLogDir;
  }

  for (const dir of LOG_DIR_CANDIDATES) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      cachedLogDir = dir;
      return cachedLogDir;
    } catch {
      continue;
    }
  }

  cachedLogDir = null;
  return cachedLogDir;
}

/**
 * Append a single log entry to `logs/<name>.log` as an NDJSON line.
 * Errors writing to the file are silently swallowed so that a logging
 * failure never propagates to the caller.
 */
function writeEntry(filePath: string, entry: LogEntry): void {
  try {
    fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // intentionally silent – logging must not crash the application
  }
}

/** Mirror log entries to stdout/stderr in development. */
function consoleEcho(level: LogLevel, entry: LogEntry): void {
  if (process.env.NODE_ENV === "production") return;

  const line = `[${entry.timestamp}] [${entry.logger}] ${level.toUpperCase()}: ${entry.message}`;
  const rest = Object.fromEntries(
    Object.entries(entry).filter(
      ([k]) => !["timestamp", "level", "logger", "message"].includes(k),
    ),
  );
  const hasRest = Object.keys(rest).length > 0;

  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line, hasRest ? rest : "");
  } else if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(line, hasRest ? rest : "");
  } else {
    // eslint-disable-next-line no-console
    console.log(line, hasRest ? rest : "");
  }
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Create a named logger that writes to `logs/<name>.log`.
 *
 * @param name  Short identifier used both as the log filename and the `logger`
 *              field in every entry (e.g. `"whatsapp"`).
 */
export function createLogger(name: string): Logger {
  function log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      logger: name,
      message,
      ...context,
    };
    const logDir = getWritableLogDir();
    if (logDir) {
      writeEntry(path.join(logDir, `${name}.log`), entry);
    }
    consoleEcho(level, entry);
  }

  return {
    debug: (msg, ctx) => log("debug", msg, ctx),
    info: (msg, ctx) => log("info", msg, ctx),
    warn: (msg, ctx) => log("warn", msg, ctx),
    error: (msg, ctx) => log("error", msg, ctx),
  };
}
