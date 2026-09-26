import { createLogger } from "../utils/logger.js";
import { buildRemoteCatalog } from "./catalog.js";
import { HEARTBEAT_INTERVAL_MS } from "../utils/broker-config.js";
import type { RemoteSummary } from "../types/artifact.js";

const log = createLogger("agent:broker-client");

export interface BrokerClientOptions {
  brokerUrl: string;
  token: string;
  remoteId: string;
  name: string;
  baseUrl: string;
  version: string;
  startedAt: string;
  heartbeatIntervalMs?: number;
  timeoutMs?: number;
}

export interface BrokerClient {
  stop(): Promise<void>;
}

interface RegisterResponse {
  remote: RemoteSummary;
  heartbeatIntervalMs: number;
}

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];
const MAX_RETRY_DELAY = 60_000;

async function requestJson(url: string, token: string, body: unknown, timeoutMs: number): Promise<{ status: number; json: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Register immediately, then heartbeat every 15s with the current catalog.
 * One in-flight heartbeat at a time; exponential backoff on failure; reset
 * to the base interval after success. Re-registers on UNKNOWN_REMOTE.
 * stop() clears timers and awaits any in-flight request; the broker record
 * is retained (offline lease) rather than deleted.
 */
export function startBrokerClient(options: BrokerClientOptions): BrokerClient {
  const timeoutMs = options.timeoutMs ?? 5000;
  const baseInterval = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  const brokerUrl = options.brokerUrl.replace(/\/+$/, "");
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let failures = 0;

  const redact = () => "[redacted]";

  async function register(): Promise<boolean> {
    if (stopped) return false;
    try {
      const { status, json } = await requestJson(
        `${brokerUrl}/api/remotes/register`,
        options.token,
        {
          remoteId: options.remoteId,
          name: options.name,
          baseUrl: options.baseUrl,
          version: options.version,
          startedAt: options.startedAt,
          catalog: buildRemoteCatalog(),
        },
        timeoutMs,
      );
      if (status === 401) {
        log.error(`Broker rejected credentials (token ${redact()}). Check ARTIFACT_BROKER_TOKEN.`);
        return false;
      }
      if (status >= 200 && status < 300) {
        const body = json as RegisterResponse;
        log.info(`Registered with broker (heartbeat every ${(body?.heartbeatIntervalMs ?? baseInterval) / 1000}s)`);
        failures = 0;
        return true;
      }
      log.error(`Broker registration failed: HTTP ${status}`);
      return false;
    } catch (err) {
      log.error(`Broker registration error: ${(err as Error).message}`);
      return false;
    }
  }

  async function heartbeat(): Promise<void> {
    if (stopped || inFlight) return;
    const p = (async () => {
      try {
        const { status } = await requestJson(
          `${brokerUrl}/api/remotes/${encodeURIComponent(options.remoteId)}/heartbeat`,
          options.token,
          { version: options.version, startedAt: options.startedAt, catalog: buildRemoteCatalog() },
          timeoutMs,
        );
        if (status === 404) {
          log.warn("Broker reports UNKNOWN_REMOTE; re-registering");
          failures = 0;
          await register();
        } else if (status === 401) {
          log.error(`Broker heartbeat rejected (token ${redact()}). Check ARTIFACT_BROKER_TOKEN.`);
          failures += 1;
        } else if (status >= 200 && status < 300) {
          failures = 0;
        } else {
          log.warn(`Broker heartbeat failed: HTTP ${status}`);
          failures += 1;
        }
      } catch (err) {
        log.warn(`Broker heartbeat error: ${(err as Error).message}`);
        failures += 1;
      } finally {
        schedule();
      }
    })();
    inFlight = p;
    try {
      await p;
    } finally {
      if (inFlight === p) inFlight = null;
    }
  }

  function nextDelay(): number {
    if (failures <= 0) return baseInterval;
    const idx = Math.min(failures - 1, RETRY_DELAYS.length - 1);
    if (failures > RETRY_DELAYS.length) return MAX_RETRY_DELAY;
    return RETRY_DELAYS[idx];
  }

  function schedule(): void {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void heartbeat(), nextDelay());
  }

  // Register immediately, then enter the heartbeat loop.
  void (async () => {
    await register();
    schedule();
  })();

  return {
    async stop(): Promise<void> {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (inFlight) {
        try {
          await inFlight;
        } catch {
          // best-effort
        }
      }
    },
  };
}
