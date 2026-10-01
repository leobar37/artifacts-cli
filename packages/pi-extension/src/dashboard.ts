import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Dashboard-link resolution for the omp extension.
 * Mirrors the CLI's identity (`getProjectId`) and lock (`daemon.json`)
 * without importing `src/utils/*` (which pulls half the CLI in).
 * Everything here is best-effort: never throws, returns null on bad input.
 */

export const NO_DAEMON_HINT = "NO_DAEMON No dashboard daemon running. Start with: artifact start";

export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Same as CLI `getProjectId`: sha256 of the canonical dir, first 16 hex. */
export function getProjectId(cwd: string): string {
  let dir: string;
  try {
    dir = realpathSync(cwd);
  } catch {
    dir = path.resolve(cwd);
  }
  return createHash("sha256").update(dir).digest("hex").slice(0, 16);
}

export interface DaemonLock {
  host: string;
  port: number;
}

/** Read-only view of `~/.artifact/daemon.json` (respects ARTIFACT_DIR). */
export function readDaemon(): DaemonLock | null {
  const file = path.join(process.env.ARTIFACT_DIR ?? path.join(homedir(), ".artifact"), "daemon.json");
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8")) as { port?: unknown; host?: unknown };
    const port = typeof raw.port === "number" ? raw.port : Number(raw.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
    const host = typeof raw.host === "string" && raw.host.trim() ? raw.host.trim() : "localhost";
    return { host, port };
  } catch {
    return null;
  }
}

export interface DashboardLinks {
  overview: string;
  project: string;
  artifact?: string;
}

/** Pure URL builder (no fs, no network) — the part tests pin down. */
export function buildLinks(host: string, port: number, projectId: string, slug?: string): DashboardLinks {
  const base = `http://${host}:${port}`;
  const project = `${base}/p/${projectId}/`;
  return {
    overview: `${base}/`,
    project,
    artifact: slug ? `${project}?select=${encodeURIComponent(slug)}` : undefined,
  };
}

/** Liveness probe: does the daemon answer /api/health? Never throws. */
export async function probeDaemon(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${host}:${port}/api/health`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export type DashboardResolution =
  | { ok: true; links: DashboardLinks }
  | { ok: false; error: string };

/**
 * Full resolution for `artifact_show`: lock file + liveness probe.
 * Returns NO_DAEMON_HINT when there is no lock or the daemon doesn't answer
 * (same message as `artifact url`, so agents repeat the right fix).
 */
export async function resolveDashboard(cwd: string, slug?: string): Promise<DashboardResolution> {
  const daemon = readDaemon();
  if (!daemon) return { ok: false, error: NO_DAEMON_HINT };
  if (!(await probeDaemon(daemon.host, daemon.port))) return { ok: false, error: NO_DAEMON_HINT };
  return { ok: true, links: buildLinks(daemon.host, daemon.port, getProjectId(cwd), slug) };
}

/**
 * Fast optimistic view line for create/update results (no probe, so writes
 * stay fast). Empty string when there is no daemon lock — callers then fall
 * back to the NO_DAEMON hint.
 */
export function viewLine(cwd: string, slug: string): string {
  const daemon = readDaemon();
  if (!daemon) return "";
  return buildLinks(daemon.host, daemon.port, getProjectId(cwd), slug).artifact ?? "";
}
