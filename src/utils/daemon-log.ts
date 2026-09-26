import { appendFileSync, existsSync, renameSync, rmSync, statSync } from "fs";
import { homedir } from "os";
import path from "path";
import { addLogSink, createLogger } from "./logger.js";

const log = createLogger("daemon");

const MAX_LOG_BYTES = 1024 * 1024;
const MAX_BURST_ERRORS = 20;
const BURST_WINDOW_MS = 60_000;

/** Same home as the registry (`ARTIFACT_DIR` override included for tests). */
export function daemonLogPath(): string {
  const home = process.env.ARTIFACT_DIR ?? path.join(homedir(), ".artifact");
  return path.join(home, "daemon.log");
}

function rotateIfNeeded(file: string): void {
  try {
    if (!existsSync(file)) return;
    if (statSync(file).size < MAX_LOG_BYTES) return;
    try {
      rmSync(`${file}.1`);
    } catch {
      // no previous rotation to remove
    }
    renameSync(file, `${file}.1`);
  } catch {
    // best-effort: logging must never break boot
  }
}

/**
 * Tee every log line to the daemon log file. Call once at daemon boot
 * (serve / dev). Safe to call when no daemon runs: writes are best-effort.
 */
export function initDaemonLog(): void {
  const file = daemonLogPath();
  rotateIfNeeded(file);
  addLogSink((line) => {
    try {
      appendFileSync(file, `${line}\n`);
    } catch {
      // drop the line rather than crash
    }
  });
  log.info(`Logging to ${file}`);
}

let burst: number[] = [];

/**
 * Log uncaught errors with stack instead of dying silently. The daemon stays
 * up (preview server, not critical) unless errors burst, which exits non-zero
 * to avoid a hot crash loop.
 */
export function installGlobalErrorHandlers(): void {
  const onError = (kind: string, err: unknown) => {
    const stack = err instanceof Error ? err.stack ?? String(err) : String(err);
    log.error(`${kind}: ${stack}`);
    const now = Date.now();
    burst = [...burst.filter((t) => now - t < BURST_WINDOW_MS), now];
    if (burst.length > MAX_BURST_ERRORS) {
      log.error(`Too many uncaught errors (${burst.length}/min), exiting`);
      process.exit(1);
    }
  };
  process.on("uncaughtException", (err) => onError("uncaughtException", err));
  process.on("unhandledRejection", (reason) => onError("unhandledRejection", reason));
}
