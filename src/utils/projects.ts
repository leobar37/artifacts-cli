import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { homedir } from "os";
import http from "http";
import path from "path";
import { getProjectId, getProjectName } from "./project.js";
import type { ProjectEntry, DaemonInfo } from "../types/artifact.js";

/**
 * Single-daemon model: one server process serves every registered project.
 * - `projects.json`: path-keyed registry (persists across restarts).
 * - `daemon.json`: single lock for the running daemon (ephemeral).
 * - `instances.json`: legacy per-project lockfile, migrated on first start.
 */

function homeDir(): string {
  return process.env.ARTIFACT_DIR ?? path.join(homedir(), ".artifact");
}

function projectsPath(): string {
  return path.join(homeDir(), "projects.json");
}

function daemonPath(): string {
  return path.join(homeDir(), "daemon.json");
}

function legacyPath(): string {
  return path.join(homeDir(), "instances.json");
}

function ensureDir(): void {
  const dir = homeDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

// --- Projects registry -------------------------------------------------------

export function readProjects(): Map<string, ProjectEntry> {
  ensureDir();
  const data = readJson<Record<string, ProjectEntry>>(projectsPath(), {});
  return new Map(Object.entries(data));
}

function writeProjects(projects: Map<string, ProjectEntry>): void {
  ensureDir();
  writeFileSync(projectsPath(), JSON.stringify(Object.fromEntries(projects), null, 2));
}

export function listProjects(): ProjectEntry[] {
  return [...readProjects().values()];
}

export function getProject(projectId: string): ProjectEntry | null {
  return readProjects().get(projectId) ?? null;
}

export function registerProject(cwd: string): ProjectEntry {
  const projects = readProjects();
  const projectId = getProjectId(cwd);
  const entry: ProjectEntry = {
    projectId,
    projectPath: cwd,
    name: getProjectName(cwd),
    addedAt: projects.get(projectId)?.addedAt ?? new Date().toISOString(),
  };
  projects.set(projectId, entry);
  writeProjects(projects);
  return entry;
}

export function unregisterProject(projectId: string): boolean {
  const projects = readProjects();
  const removed = projects.delete(projectId);
  if (removed) writeProjects(projects);
  return removed;
}

// --- Daemon lock -------------------------------------------------------------

export function getDaemon(): DaemonInfo | null {
  ensureDir();
  return readJson<DaemonInfo | null>(daemonPath(), null);
}

export function setDaemon(info: DaemonInfo): void {
  ensureDir();
  writeFileSync(daemonPath(), JSON.stringify(info, null, 2));
}

export function removeDaemon(): void {
  try {
    if (existsSync(daemonPath())) rmSync(daemonPath());
  } catch {
    // best-effort
  }
}

/** True when the daemon answers /api/health AND its PID is still running. */
export function isDaemonAlive(info: DaemonInfo): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${info.port}/api/health`, (res) => {
      if (res.statusCode === 200) {
        try {
          process.kill(info.pid, 0);
          resolve(true);
        } catch {
          resolve(false);
        }
      } else {
        resolve(false);
      }
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.setTimeout(2000);
  });
}

// --- Legacy migration --------------------------------------------------------

interface LegacyInstance {
  projectPath?: string;
}

/**
 * Import project paths from the legacy per-project `instances.json`
 * (one server per project) into the shared registry. The legacy file is
 * removed afterwards. Returns the imported entries.
 */
export function migrateLegacyInstances(): ProjectEntry[] {
  if (!existsSync(legacyPath())) return [];
  const legacy = readJson<Record<string, LegacyInstance>>(legacyPath(), {});
  const paths = [...new Set(
    Object.values(legacy)
      .map((e) => e.projectPath)
      .filter((p): p is string => typeof p === "string" && p.length > 0 && existsSync(p)),
  )];
  const imported = paths.map((p) => registerProject(p));
  try {
    rmSync(legacyPath());
  } catch {
    // best-effort
  }
  return imported;
}
