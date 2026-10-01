import { Hono, type Context } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Server } from "http";
import { fileURLToPath } from "url";
import { timingSafeEqual } from "crypto";
import path from "path";
import {
  buildOverview,
  getRemote,
  heartbeatRemote,
  isOnline,
  listRemoteSummaries,
  registerRemote,
  removeRemote,
  summarizeRemote,
} from "./remote-registry.js";
import { HEARTBEAT_INTERVAL_MS } from "../utils/broker-config.js";
import type { StoredRemoteEntry } from "../types/artifact.js";
import { getMdxGuideSource, renderMarkdownViewer, serveMermaidAsset, type ViewerTheme } from "../server/markdown-viewer.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("broker");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACT_VERSION = process.env.ARTIFACT_VERSION || "0.1.0";
const CONNECT_TIMEOUT_MS = 5000;

export interface BrokerServerOptions {
  port: number;
  host?: string;
  /** Shared secret; required. Never logged or returned. */
  token: string;
}

export interface RunningBrokerServer {
  port: number;
  stop(): Promise<void>;
}

function bearerOk(header: string | null | undefined, expected: string): boolean {
  if (!expected || !header) return false;
  const m = /^Bearer (.+)$/.exec(header.trim());
  if (!m) return false;
  const a = Buffer.from(m[1].trim(), "utf-8");
  const b = Buffer.from(expected, "utf-8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Reject decoded `..`, NUL, or backslash segments. Null = invalid. */
export function sanitizeArtifactPath(requestPath: string): string | null {
  const first = requestPath.split("?")[0] || "/";
  let raw = first.startsWith("/") ? first : `/${first}`;
  // Decode repeatedly (catches %252E double-encoding). A first-decode
  // failure is invalid; later failures keep the last good value so legit
  // percent-bearing slugs are not rejected.
  for (let i = 0; i < 3; i++) {
    if (!raw.includes("%")) break;
    try {
      const next = decodeURIComponent(raw);
      if (next === raw) break;
      raw = next;
    } catch {
      if (i === 0) return null;
      break;
    }
  }
  const segments = raw.split("/").slice(1);
  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === ".." || seg.includes("\0") || seg.includes("\\")) return null;
  }
  if (/(^|\/)(\.\.)(\/|$)/.test(raw)) return null;
  return raw;
}

interface AgentHealth {
  remoteId?: string;
}

/** Authenticated probe of the agent before persisting registration. */
async function probeAgent(baseUrl: string, token: string, timeoutMs = CONNECT_TIMEOUT_MS): Promise<{ ok: true; health: AgentHealth } | { ok: false; reason: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/agent/health`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const health = (await res.json().catch(() => null)) as AgentHealth | null;
    if (!health || typeof health.remoteId !== "string") return { ok: false, reason: "bad health payload" };
    return { ok: true, health };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

export async function startBrokerServer(options: BrokerServerOptions): Promise<RunningBrokerServer> {
  if (!options.token) throw new Error("Broker requires ARTIFACT_BROKER_TOKEN");
  const token = options.token;
  // Control-plane middleware reads the token from env; scope it to this
  // process (the broker child sets ARTIFACT_BROKER_TOKEN in its own env).
  const prevToken = process.env.ARTIFACT_BROKER_TOKEN;
  process.env.ARTIFACT_BROKER_TOKEN = token;

  try {
    const app = new Hono();
    app.onError((err, c) => {
      log.error(`unhandled route error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
      return c.json({ error: "INTERNAL_ERROR", message: "Unexpected server error" }, 500);
    });

    app.get("/api/health", (c) => {
      return c.json({ status: "ok", role: "broker", timestamp: new Date().toISOString(), version: ARTIFACT_VERSION });
    });

    // --- Authenticated control plane (closure token; never env-dependent) -----
    const checkControlAuth = async (c: Context, next: () => Promise<void>) => {
      if (!bearerOk(c.req.header("authorization"), token)) {
        return c.json({ error: "UNAUTHORIZED" }, 401);
      }
      await next();
    };
    app.post("/api/remotes/register", checkControlAuth, async (c) => {
      const body = await c.req.json().catch(() => null);
      const remoteId = body?.remoteId;
      const name = body?.name;
      const baseUrl = body?.baseUrl;
      const version = body?.version;
      const startedAt = body?.startedAt;
      const catalog = body?.catalog;
      if (!remoteId || typeof remoteId !== "string" || !name || typeof name !== "string" ||
          !baseUrl || typeof baseUrl !== "string" || !catalog || typeof catalog !== "object") {
        return c.json({ error: "INVALID_REGISTRATION", message: "remoteId, name, baseUrl, version, startedAt, catalog required" }, 400);
      }
      // Verify the agent is reachable and the identity matches before mutating.
      const probe = await probeAgent(baseUrl, token);
      if (!probe.ok) {
        return c.json({ error: "AGENT_UNREACHABLE" }, 422);
      }
      if (probe.health.remoteId !== remoteId) {
        return c.json({ error: "REMOTE_ID_MISMATCH" }, 409);
      }
      const entry = registerRemote({
        remoteId,
        name,
        baseUrl: baseUrl.replace(/\/+$/, ""),
        version: typeof version === "string" ? version : "unknown",
        startedAt: typeof startedAt === "string" ? startedAt : new Date().toISOString(),
        catalog,
      });
      const summary = summarizeRemote(entry);
      return c.json({ remote: summary, heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS });
    });

    app.post("/api/remotes/:remoteId/heartbeat", checkControlAuth, async (c) => {
      const remoteId = c.req.param("remoteId") ?? "";
      const body = await c.req.json().catch(() => null);
      if (!body?.catalog || typeof body.catalog !== "object") {
        return c.json({ error: "INVALID_HEARTBEAT", message: "catalog required" }, 400);
      }
      const entry = heartbeatRemote(remoteId, {
        version: typeof body.version === "string" ? body.version : "unknown",
        startedAt: typeof body.startedAt === "string" ? body.startedAt : new Date().toISOString(),
        catalog: body.catalog,
      });
      if (!entry) return c.json({ error: "UNKNOWN_REMOTE" }, 404);
      return c.json({ remote: summarizeRemote(entry), heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS });
    });

    app.delete("/api/remotes/:remoteId", checkControlAuth, (c) => {
      const remoteId = c.req.param("remoteId") ?? "";
      const entry = getRemote(remoteId);
      if (!entry) return c.json({ error: "UNKNOWN_REMOTE" }, 404);
      if (isOnline(entry.lastSeenAt)) {
        return c.json({ error: "REMOTE_ONLINE" }, 409);
      }
      removeRemote(remoteId);
      return c.json({ success: true, remoteId });
    });

    // --- Public read-only data plane (Tailnet peers; not exposed publicly) ----
    app.get("/api/remotes", (c) => {
      return c.json({ remotes: listRemoteSummaries() });
    });

    app.get("/api/overview", (c) => {
      return c.json({ remotes: buildOverview() });
    });

    app.get("/r/:remoteId/p/:projectId/api/artifacts", (c) => {
      const entry = getRemote(c.req.param("remoteId"));
      if (!entry) return c.json({ error: "UNKNOWN_REMOTE" }, 404);
      const projectId = c.req.param("projectId");
      const found = entry.catalog.projects.find((p) => p.project.projectId === projectId);
      if (!found) return c.json({ error: "UNKNOWN_PROJECT" }, 404);
      const type = c.req.query("type");
      if (type && type !== "generic" && type !== "study" && type !== "wireframe") {
        return c.json({ error: `Invalid type "${type}". Must be one of: generic, study, wireframe` }, 400);
      }
      const artifacts = type ? found.artifacts.filter((a) => a.type === type) : found.artifacts;
      return c.json({ artifacts, totalCount: artifacts.length, lastScanAt: entry.catalog.generatedAt });
    });

    app.get("/r/:remoteId/p/:projectId/api/project", (c) => {
      const entry = getRemote(c.req.param("remoteId"));
      if (!entry) return c.json({ error: "UNKNOWN_REMOTE" }, 404);
      const projectId = c.req.param("projectId");
      const found = entry.catalog.projects.find((p) => p.project.projectId === projectId);
      if (!found) return c.json({ error: "UNKNOWN_PROJECT" }, 404);
      return c.json({ project: found.project });
    });

    // --- Live proxy to the agent (never touches the stored snapshot) ---------
    const proxyArtifacts = async (c: Context, method: "GET" | "HEAD") => {
      const resolved = resolveUpstream(c, "/artifacts");
      if ("error" in resolved) return c.json(resolved.body, resolved.status as 400);
      const { entry, upstreamUrl } = resolved;
      return proxyRequest(c, entry, upstreamUrl, method, CONNECT_TIMEOUT_MS);
    };

    app.on(["GET", "HEAD"], "/r/:remoteId/p/:projectId/artifacts/*", (c) =>
      proxyArtifacts(c, c.req.method as "GET" | "HEAD"),
    );

    app.get("/r/:remoteId/p/:projectId/api/events", (c) => {
      const resolved = resolveUpstream(c, "/events");
      if ("error" in resolved) return c.json(resolved.body, resolved.status as 400);
      const { entry, upstreamUrl } = resolved;
      // No total-body timeout for SSE; abort upstream on browser disconnect.
      return proxyRequest(c, entry, upstreamUrl, "GET", 0);
    });

    // Same MDX component guide the local daemon serves.
    app.get("/mdx-guide", (c) => {
      const theme: ViewerTheme = c.req.query("theme") === "light" ? "light" : "dark";
      return c.html(
        renderMarkdownViewer(getMdxGuideSource(), { slug: "mdx-guide", format: "mdx", theme }),
        200,
        { "Cache-Control": "no-store" },
      );
    });
    // Same mermaid bundle the local daemon serves (broker origin = viewer origin).
    app.get("/assets/mermaid.min.js", () => serveMermaidAsset());


    // --- Dashboard (same build; SPA fallback covers /r/... deep links) --------
    const dashboardPath = path.join(__dirname, "../../dist/dashboard");
    app.use("/*", serveStatic({ root: dashboardPath }));
    app.get("*", async (c) => {
      const fs = await import("fs");
      try {
        const html = fs.readFileSync(path.join(dashboardPath, "index.html"), "utf-8");
        return c.html(html);
      } catch {
        return c.json({ error: "NOT_FOUND" }, 404);
      }
    });

    const { serve } = await import("@hono/node-server");
    const MAX_PORT_ATTEMPTS = 10;
    const bindHost = options.host ?? "127.0.0.1";

    function tryStart(port: number): Promise<{ srv: Server; bound: number }> {
      return new Promise((resolve, reject) => {
        const srv = serve(
          { fetch: app.fetch, port, hostname: bindHost },
          () => {
            log.info(`Broker running at http://${bindHost}:${port}`);
            resolve({ srv: srv as unknown as Server, bound: port });
          },
        );
        srv.on("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EADDRINUSE" && port < options.port + MAX_PORT_ATTEMPTS) {
            log.info(`Port ${port} is in use, trying ${port + 1}...`);
            tryStart(port + 1).then(resolve).catch(reject);
          } else {
            reject(new Error(`Failed to start broker: ${err.message}`));
          }
        });
      });
    }

    const { srv, bound } = await tryStart(options.port);
    let stopped = false;
    return {
      port: bound,
      async stop(): Promise<void> {
        if (stopped) return;
        stopped = true;
        await new Promise<void>((resolve) => srv.close(() => resolve()));
      },
    };
  } finally {
    if (prevToken === undefined) delete process.env.ARTIFACT_BROKER_TOKEN;
    else process.env.ARTIFACT_BROKER_TOKEN = prevToken;
  }

  function resolveUpstream(
    c: Context,
    kind: "/artifacts" | "/events",
  ): { entry: StoredRemoteEntry; upstreamUrl: string } | { error: true; status: number; body: Record<string, unknown> } {
    const remoteId = c.req.param("remoteId") ?? "";
    const projectId = c.req.param("projectId") ?? "";
    const entry = getRemote(remoteId);
    if (!entry) return { error: true, status: 404, body: { error: "UNKNOWN_REMOTE" } };
    const found = entry.catalog.projects.find((p) => p.project.projectId === projectId);
    if (!found) return { error: true, status: 404, body: { error: "UNKNOWN_PROJECT" } };
    if (!isOnline(entry.lastSeenAt)) {
      return { error: true, status: 503, body: { error: "REMOTE_OFFLINE", remoteId, lastSeenAt: entry.lastSeenAt } };
    }
    const base = entry.baseUrl.replace(/\/+$/, "");
    if (kind === "/artifacts") {
      const prefix = `/r/${remoteId}/p/${projectId}/artifacts`;
      const raw = c.req.path.slice(prefix.length) || "/";
      const clean = sanitizeArtifactPath(raw);
      if (clean === null) return { error: true, status: 400, body: { error: "INVALID_ARTIFACT_PATH" } };
      const query = new URL(c.req.url).search;
      // `clean` is decoded; re-encode per segment so spaces/unicode survive.
      const encoded = clean.split("/").map((s) => encodeURIComponent(s)).join("/");
      const upstreamUrl = `${base}/agent/p/${encodeURIComponent(projectId)}/artifacts${encoded}${query}`;
      return { entry, upstreamUrl };
    }
    const upstreamUrl = `${base}/agent/p/${encodeURIComponent(projectId)}/events`;
    return { entry, upstreamUrl };
  }

  async function proxyRequest(
    c: Context,
    entry: StoredRemoteEntry,
    upstreamUrl: string,
    method: string,
    connectTimeoutMs: number,
  ): Promise<Response> {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    // Browser disconnect aborts the upstream request.
    c.req.raw.signal?.addEventListener("abort", onAbort, { once: true });
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    if (connectTimeoutMs > 0) {
      connectTimer = setTimeout(() => ctrl.abort(), connectTimeoutMs);
    }
    try {
      const upstream = await fetch(upstreamUrl, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
      // Headers arrived: clear the connection timer so large bodies can finish.
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      const headers = new Headers();
      for (const [k, v] of upstream.headers) {
        const lk = k.toLowerCase();
        if (["content-type", "content-length", "cache-control", "etag", "last-modified", "accept-ranges"].includes(lk)) {
          headers.set(k, v);
        }
      }
      if (upstreamUrl.includes("/events")) {
        headers.set("Content-Type", "text/event-stream");
        headers.set("Cache-Control", "no-cache");
        headers.set("Connection", "keep-alive");
      }
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch {
      if (connectTimer) clearTimeout(connectTimer);
      return c.json({ error: "REMOTE_UNREACHABLE", remoteId: entry.remoteId }, 502);
    } finally {
      c.req.raw.signal?.removeEventListener("abort", onAbort);
    }
  }
}
