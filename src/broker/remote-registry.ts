import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import type {
  RemoteCatalog,
  RemoteOverviewGroup,
  RemoteSummary,
  StoredRemoteEntry,
} from "../types/artifact.js";
import { REMOTE_ONLINE_THRESHOLD_MS } from "../utils/broker-config.js";

function artifactDir(): string {
  return process.env.ARTIFACT_DIR ?? join(homedir(), ".artifact");
}

export function remotesFilePath(): string {
  return join(artifactDir(), "broker", "remotes.json");
}

export type Clock = () => number;

function defaultClock(): number {
  return Date.now();
}

function ensureParent(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
}

function readAll(): Map<string, StoredRemoteEntry> {
  const file = remotesFilePath();
  if (!existsSync(file)) return new Map();
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as Record<string, StoredRemoteEntry>;
    return new Map(Object.entries(parsed ?? {}));
  } catch {
    return new Map();
  }
}

function writeAll(entries: Map<string, StoredRemoteEntry>): void {
  const file = remotesFilePath();
  ensureParent(file);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(Object.fromEntries(entries), null, 2));
  renameSync(tmp, file);
}

export function isOnline(lastSeenAt: string, now: number = defaultClock()): boolean {
  const t = Date.parse(lastSeenAt);
  if (Number.isNaN(t)) return false;
  return now - t <= REMOTE_ONLINE_THRESHOLD_MS;
}

function toSummary(entry: StoredRemoteEntry, now: number): RemoteSummary {
  const projectCount = entry.catalog.projects.length;
  const artifactCount = entry.catalog.projects.reduce((n, p) => n + p.totalCount, 0);
  return {
    remoteId: entry.remoteId,
    name: entry.name,
    version: entry.version,
    status: isOnline(entry.lastSeenAt, now) ? "online" : "offline",
    lastSeenAt: entry.lastSeenAt,
    projectCount,
    artifactCount,
  };
}

export interface RegistrationInput {
  remoteId: string;
  name: string;
  baseUrl: string;
  version: string;
  startedAt: string;
  catalog: RemoteCatalog;
}

export interface HeartbeatInput {
  version: string;
  startedAt: string;
  catalog: RemoteCatalog;
}

/** Insert or replace the mutable fields; identity (remoteId) is preserved. */
export function registerRemote(input: RegistrationInput, clock: Clock = defaultClock): StoredRemoteEntry {
  const entries = readAll();
  const entry: StoredRemoteEntry = {
    remoteId: input.remoteId,
    name: input.name,
    baseUrl: input.baseUrl,
    version: input.version,
    agentStartedAt: input.startedAt,
    lastSeenAt: new Date(clock()).toISOString(),
    catalog: input.catalog,
  };
  entries.set(input.remoteId, entry);
  writeAll(entries);
  return entry;
}

/** Refresh lease + snapshot. Returns null for unknown IDs (caller maps to 404). */
export function heartbeatRemote(remoteId: string, input: HeartbeatInput, clock: Clock = defaultClock): StoredRemoteEntry | null {
  const entries = readAll();
  const existing = entries.get(remoteId);
  if (!existing) return null;
  existing.version = input.version;
  existing.agentStartedAt = input.startedAt;
  existing.catalog = input.catalog;
  existing.lastSeenAt = new Date(clock()).toISOString();
  entries.set(remoteId, existing);
  writeAll(entries);
  return existing;
}

export function getRemote(remoteId: string): StoredRemoteEntry | null {
  return readAll().get(remoteId) ?? null;
}

/** Remove a stored entry. Returns false when unknown. */
export function removeRemote(remoteId: string): boolean {
  const entries = readAll();
  const ok = entries.delete(remoteId);
  if (ok) writeAll(entries);
  return ok;
}

export function listRemoteSummaries(clock: Clock = defaultClock): RemoteSummary[] {
  const now = clock();
  const out = [...readAll().values()].map((e) => toSummary(e, now));
  out.sort((a, b) => {
    if (a.status !== b.status) return a.status === "online" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return out;
}

export function buildOverview(clock: Clock = defaultClock): RemoteOverviewGroup[] {
  const now = clock();
  const entries = [...readAll().values()];
  entries.sort((a, b) => {
    const sa = isOnline(a.lastSeenAt, now) ? 0 : 1;
    const sb = isOnline(b.lastSeenAt, now) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return entries.map((entry) => ({ remote: toSummary(entry, now), projects: entry.catalog.projects }));
}

export function summarizeRemote(entry: StoredRemoteEntry, clock: Clock = defaultClock): RemoteSummary {
  return toSummary(entry, clock());
}
