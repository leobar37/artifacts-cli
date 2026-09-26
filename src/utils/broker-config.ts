import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

export interface BrokerFileConfig {
  url?: string;
  remoteName?: string;
}

export const HEARTBEAT_INTERVAL_MS = 15_000;
export const REMOTE_ONLINE_THRESHOLD_MS = 45_000;

function artifactDir(): string {
  return process.env.ARTIFACT_DIR ?? join(homedir(), ".artifact");
}

export function brokerConfigPath(): string {
  return join(artifactDir(), "broker.json");
}

/** Agent-side non-secret config. Secrets live only in ARTIFACT_BROKER_TOKEN. */
export function readBrokerFileConfig(): BrokerFileConfig {
  const file = brokerConfigPath();
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as BrokerFileConfig;
    return { url: typeof parsed.url === "string" ? parsed.url : undefined, remoteName: typeof parsed.remoteName === "string" ? parsed.remoteName : undefined };
  } catch {
    return {};
  }
}

export function writeBrokerFileConfig(cfg: BrokerFileConfig): void {
  const file = brokerConfigPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(cfg, null, 2));
}

export function resolveBrokerUrl(flagUrl?: string): string | null {
  const v = (flagUrl ?? process.env.ARTIFACT_BROKER_URL ?? readBrokerFileConfig().url ?? "").trim();
  return v || null;
}

export function resolveRemoteName(flagName?: string): string | null {
  const v = (flagName ?? process.env.ARTIFACT_REMOTE_NAME ?? readBrokerFileConfig().remoteName ?? "").trim();
  return v || null;
}

export function getBrokerToken(): string | null {
  const t = (process.env.ARTIFACT_BROKER_TOKEN ?? "").trim();
  return t || null;
}

/**
 * Shared base-URL validation: http/https only, no credentials/query/fragment,
 * trailing slash normalized away. Throws on invalid input.
 */
export function parseHttpBaseUrl(raw: string, label = "URL"): string {
  const v = raw.trim();
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new Error(`${label} is invalid: ${raw}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`${label} must use http:// or https:// (got ${u.protocol})`);
  }
  if (u.username || u.password) throw new Error(`${label} must not include credentials`);
  if (u.search && u.search !== "") throw new Error(`${label} must not include a query string`);
  if (u.hash && u.hash !== "") throw new Error(`${label} must not include a fragment`);
  return u.origin + (u.pathname && u.pathname !== "/" ? u.pathname.replace(/\/+$/, "") : "");
}
