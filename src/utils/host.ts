import { execSync } from "child_process";
import { createLogger } from "./logger.js";

const log = createLogger("host");

/** Run `tailscale ip -4` and return the first IPv4, or null if unavailable. */
export function getTailscaleIPv4(): string | null {
  try {
    const out = execSync("tailscale ip -4", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    const first = out.split("\n").map((l) => l.trim()).find(Boolean);
    if (first && /^\d+\.\d+\.\d+\.\d+$/.test(first)) return first;
    return null;
  } catch {
    return null;
  }
}

/** Try `tailscale status --json` to get Self DNSName / HostName. */
export function getTailscaleHostname(): string | null {
  try {
    const out = execSync("tailscale status --json", {
      encoding: "utf-8",
      timeout: 5000,
    });
    const data = JSON.parse(out) as {
      Self?: { HostName?: string; DNSName?: string };
    };
    const dns = data.Self?.DNSName?.replace(/\.$/, "");
    if (dns) return dns;
    if (data.Self?.HostName) return data.Self.HostName;
    return null;
  } catch {
    return null;
  }
}

export interface ResolvedHost {
  /** Hostname/IP shown to the user (e.g. tailscale IP, hostname, or localhost). */
  displayHost: string;
  /** Interface the HTTP server binds to. */
  bindHost: string;
  /** True when resolved via Tailscale. */
  viaTailscale: boolean;
}

const LOOPBACK: Record<string, true> = {
  "127.0.0.1": true,
  localhost: true,
  "::1": true,
};

/**
 * Resolve the host the server should advertise.
 *
 * Order: explicit --host / ARTIFACT_HOST / project config > "tailscale"
 * magic keyword or --tailscale flag > default loopback.
 * Explicit non-loopback hosts bind 0.0.0.0 so they are reachable on that network.
 */
export function resolveHost(input?: string | null): ResolvedHost {
  const raw = (input ?? "").trim();

  if (raw === "" || raw === "localhost" || raw === "loopback") {
    return { displayHost: "localhost", bindHost: "127.0.0.1", viaTailscale: false };
  }

  if (raw === "tailscale" || raw === "ts") {
    const ip = getTailscaleIPv4();
    if (ip) {
      return { displayHost: ip, bindHost: "0.0.0.0", viaTailscale: true };
    }
    const name = getTailscaleHostname();
    if (name) {
      return { displayHost: name, bindHost: "0.0.0.0", viaTailscale: true };
    }
    log.warn("Tailscale requested but `tailscale ip -4` failed. Falling back to localhost.");
    return { displayHost: "localhost", bindHost: "127.0.0.1", viaTailscale: false };
  }

  if (LOOPBACK[raw]) {
    return { displayHost: "localhost", bindHost: "127.0.0.1", viaTailscale: false };
  }
  return { displayHost: raw, bindHost: "0.0.0.0", viaTailscale: false };
}
