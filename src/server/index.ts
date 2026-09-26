import { Hono, type Context, type Next } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";
import type { Server } from "http";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, statSync } from "fs";
import { timingSafeEqual } from "crypto";
import path from "path";
import healthRouter from "./routes/health.js";
import artifactsRouter, { createArtifactsRouter, createArtifactCache, type ArtifactCache } from "./routes/artifacts.js";
import projectRouter from "./routes/project.js";
import { registry } from "../handlers/registry.js";
import { sseRegistry, createSSERegistry, type SSERegistry } from "./sse.js";
import {
  initWatcher,
  stopWatcher,
  unwatchProject,
  watchProject,
  createWatcher,
  type WatcherHandle,
} from "./watcher.js";
import {
  getProject,
  listProjects,
  registerProject,
  unregisterProject,
} from "../utils/projects.js";
import { getProjectArtifactsPath } from "../utils/project.js";
import type { ProjectEnv } from "../types/artifact.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("server");

export type ServerRole = "local" | "agent";

export interface ServerOptions {
  port: number;
  host?: string;
  role?: ServerRole;
  /** Required when role === "agent". */
  remoteId?: string;
  /** Shared secret; required when role === "agent". Never logged. */
  remoteToken?: string;
  /** Local mode serves the dashboard SPA; agent mode never does. */
  serveDashboard?: boolean;
}

export interface RunningArtifactServer {
  port: number;
  stop(): Promise<void>;
}

const ARTIFACT_VERSION = process.env.ARTIFACT_VERSION || "0.1.0";

let server: Server | null = null;
let actualPort = 0;
let singletonHandle: RunningArtifactServer | null = null;
let trackedStop: (() => Promise<void>) | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACT_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

/** Resolve the project for `/p/:projectId/...`; 404 JSON when unknown. */
async function resolveProject(c: Context<ProjectEnv>, next: Next): Promise<Response | void> {
  const projectId = c.req.param("projectId") ?? "";
  const project = getProject(projectId);
  if (!project) {
    return c.json({ error: "UNKNOWN_PROJECT", message: "Project not registered" }, 404);
  }
  c.set("project", project);
  await next();
}

function bearerOk(header: string | null | undefined, expected: string): boolean {
  if (!expected || !header) return false;
  const m = /^Bearer (.+)$/.exec(header.trim());
  if (!m) return false;
  const a = Buffer.from(m[1].trim(), "utf-8");
  const b = Buffer.from(expected, "utf-8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Shared static-file responder with traversal protection. `requestPath` is
 * the already-parsed wildcard path under the project prefix; the caller
 * decides which route prefix to strip.
 */
export function serveArtifactFile(c: Context, base: string, requestPath: string): Response {
  let raw: string;
  try {
    raw = decodeURIComponent(requestPath.split("?")[0] || "/");
  } catch {
    return c.text("Bad request", 400);
  }
  if (!raw.startsWith("/")) raw = `/${raw}`;
  const segments = raw.split("/").slice(1);
  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === ".." || seg.includes("\0") || seg.includes("\\")) {
      return c.text("Forbidden", 403);
    }
  }
  const file = path.resolve(base, `.${raw}`);
  const rel = path.relative(base, file);

  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    return c.text("Forbidden", 403);
  }

  try {
    if (!existsSync(file) || !statSync(file).isFile()) {
      return c.text("Not found", 404);
    }
  } catch {
    return c.text("Not found", 404);
  }

  const mime = ARTIFACT_MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  return new Response(readFileSync(file), {
    headers: { "Content-Type": mime },
  });
}

export interface CreateServerDeps {
  cache?: ArtifactCache;
  sse?: SSERegistry;
  watcher?: WatcherHandle;
}

/**
 * Explicit reusable server factory. Defaults reproduce today's local
 * behavior; `role: "agent"` requires remoteId/remoteToken and never serves
 * the dashboard SPA. Owns its HTTP server and cleanup without module globals.
 */
export async function createArtifactServer(
  options: ServerOptions,
  deps: CreateServerDeps = {},
): Promise<RunningArtifactServer> {
  const role: ServerRole = options.role ?? "local";
  const serveDashboard = options.serveDashboard ?? role === "local";

  if (role === "agent") {
    if (!options.remoteId) throw new Error("Agent role requires remoteId");
    if (!options.remoteToken) throw new Error("Agent role requires remoteToken (ARTIFACT_BROKER_TOKEN)");
  }

  const cache = deps.cache ?? createArtifactCache();
  const sse = deps.sse ?? createSSERegistry();
  const watcher = deps.watcher ?? createWatcher();
  const remoteId = options.remoteId ?? "";
  const agentToken = options.remoteToken ?? "";

  const app = new Hono();
  app.onError((err, c) => {
    log.error(`unhandled route error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    return c.json({ error: "INTERNAL_ERROR", message: "Unexpected server error" }, 500);
  });

  if (role === "agent") {
    const checkAuth = (c: Context): Response | null => {
      if (!bearerOk(c.req.header("authorization"), agentToken)) {
        return c.json({ error: "UNAUTHORIZED" }, 401);
      }
      return null;
    };

    app.get("/api/health", (c) => {
      return c.json({ status: "ok", role: "agent", timestamp: new Date().toISOString(), version: ARTIFACT_VERSION });
    });
    app.get("/agent/health", (c) => {
      const denied = checkAuth(c);
      if (denied) return denied;
      return c.json({ status: "ok", role: "agent", remoteId, timestamp: new Date().toISOString(), version: ARTIFACT_VERSION });
    });

    const agentApp = new Hono<ProjectEnv>();
    agentApp.use("*", async (c, next) => {
      if (!bearerOk(c.req.header("authorization"), agentToken)) {
        return c.json({ error: "UNAUTHORIZED" }, 401);
      }
      await next();
    });
    agentApp.use("*", resolveProject);

    agentApp.get("/events", (c) => {
      const project = c.get("project");
      return streamSSE(c, async (stream) => {
        const clientId = sse.add(stream, project.projectId);
        log.info(`agent client connected: ${clientId} (${project.projectId})`);
        const keepalive = setInterval(() => {
          stream.writeSSE({ event: "ping", data: JSON.stringify({ t: new Date().toISOString() }) }).catch(() => {});
        }, 15_000);
        stream.onAbort(() => {
          clearInterval(keepalive);
          sse.remove(clientId);
          log.info(`agent client disconnected: ${clientId}`);
        });
        await new Promise(() => {});
      });
    });

    agentApp.on(["GET", "HEAD"], "/artifacts/*", (c) => {
      const project = c.get("project");
      const base = getProjectArtifactsPath(project.projectPath);
      const prefix = `/agent/p/${project.projectId}/artifacts`;
      const raw = c.req.path.slice(prefix.length) || "/";
      return serveArtifactFile(c as unknown as Context, base, raw);
    });

    app.route("/agent/p/:projectId", agentApp);
    app.notFound((c) => c.json({ error: "NOT_FOUND" }, 404));
  } else {
    app.route("/api/health", healthRouter);

    app.get("/api/projects", (c) => {
      return c.json({ projects: listProjects() });
    });

    app.get("/api/overview", (c) => {
      const groups = listProjects().map((project) => {
        const index = cache.get(project.projectId, getProjectArtifactsPath(project.projectPath));
        return { project, totalCount: index.totalCount, artifacts: index.artifacts };
      });
      return c.json({ groups });
    });

    app.post("/api/projects", async (c) => {
      const body = await c.req.json().catch(() => null);
      const raw = body?.path;
      if (!raw || typeof raw !== "string") {
        return c.json({ error: "Request body must include { path: string }" }, 400);
      }
      const projectPath = path.resolve(raw);
      if (!existsSync(projectPath)) {
        return c.json({ error: "NOT_FOUND", message: `Directory not found: ${projectPath}` }, 404);
      }
      const entry = registerProject(projectPath);
      watcher.watch(entry.projectId, getProjectArtifactsPath(projectPath));
      return c.json({ project: entry });
    });

    app.delete("/api/projects/:projectId", (c) => {
      const projectId = c.req.param("projectId");
      const removed = unregisterProject(projectId);
      if (!removed) {
        return c.json({ error: "NOT_FOUND", message: "Project not registered" }, 404);
      }
      watcher.unwatch(projectId);
      cache.invalidate(projectId);
      sse.removeByProject(projectId);
      return c.json({ success: true, projectId });
    });

    const projectApp = new Hono<ProjectEnv>();
    projectApp.use("*", resolveProject);

    projectApp.route("/api/artifacts", createArtifactsRouter({ cache, sse }));
    projectApp.route("/api/project", projectRouter);

    projectApp.get("/api/events", (c) => {
      const project = c.get("project");
      return streamSSE(c, async (stream) => {
        const clientId = sse.add(stream, project.projectId);
        log.info(`client connected: ${clientId} (${project.projectId})`);
        const keepalive = setInterval(() => {
          stream.writeSSE({ event: "ping", data: JSON.stringify({ t: new Date().toISOString() }) }).catch(() => {});
        }, 15_000);
        stream.onAbort(() => {
          clearInterval(keepalive);
          sse.remove(clientId);
          log.info(`client disconnected: ${clientId}`);
        });
        await new Promise(() => {});
      });
    });

    projectApp.on(["GET", "HEAD"], "/artifacts/*", (c) => {
      const project = c.get("project");
      const base = getProjectArtifactsPath(project.projectPath);
      const prefix = `/p/${project.projectId}/artifacts`;
      const raw = c.req.path.slice(prefix.length) || "/";
      return serveArtifactFile(c as unknown as Context, base, raw);
    });

    app.route("/p/:projectId", projectApp);

    if (serveDashboard) {
      const dashboardPath = path.join(__dirname, "../../dist/dashboard");
      app.use("/*", serveStatic({ root: dashboardPath }));
      app.get("*", async (c) => {
        const fs = await import("fs");
        const html = fs.readFileSync(path.join(dashboardPath, "index.html"), "utf-8");
        return c.html(html);
      });
    }
  }

  // --- File watcher for every registered project ------------------------------
  await registry.loadAll();
  watcher.init({
    onInvalidate: (projectId) => cache.invalidate(projectId),
    onBroadcast: (projectId, slug) => {
      sse.broadcastTo(projectId, "artifacts:update", {
        slug,
        lastScanAt: new Date().toISOString(),
      });
    },
  });
  for (const entry of listProjects()) {
    watcher.watch(entry.projectId, getProjectArtifactsPath(entry.projectPath));
  }

  const { serve } = await import("@hono/node-server");

  const MAX_PORT_ATTEMPTS = 10;
  const bindHost = options.host ?? "127.0.0.1";

  function tryStart(port: number): Promise<{ srv: Server; bound: number }> {
    return new Promise((resolve, reject) => {
      const srv = serve(
        { fetch: app.fetch, port, hostname: bindHost },
        () => {
          log.info(`Server (${role}) running at http://${bindHost}:${port}`);
          resolve({ srv: srv as unknown as Server, bound: port });
        },
      );
      srv.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && port < options.port + MAX_PORT_ATTEMPTS) {
          log.info(`Port ${port} is in use, trying ${port + 1}...`);
          tryStart(port + 1).then(resolve).catch(reject);
        } else {
          reject(new Error(`Failed to start server: ${err.message}`));
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
      watcher.stop();
      cache.invalidate();
      await new Promise<void>((resolve) => {
        srv.close(() => resolve());
      });
    },
  };
}

/** Backwards-compatible singleton wrapper for current CLI callers/tests. */
export async function startServer(options: ServerOptions): Promise<Server> {
  const handle = await createArtifactServer(options);
  singletonHandle = handle;
  actualPort = handle.port;
  trackedStop = () => handle.stop();
  const fake = { close: (cb?: () => void) => { handle.stop().then(() => cb?.()); } } as unknown as Server;
  server = fake;
  return fake;
}

/** Port the running server actually bound to (after auto-retry). */
export function getActualPort(): number {
  return actualPort;
}

export async function stopServer(): Promise<void> {
  if (trackedStop) {
    await trackedStop();
    trackedStop = null;
    singletonHandle = null;
    server = null;
    return;
  }
  stopWatcher();
  sseRegistry.removeByProject("__none__");
  if (!server) return;
  return new Promise((resolve) => {
    server!.close(() => {
      server = null;
      resolve();
    });
  });
}

export { artifactsRouter, projectRouter, healthRouter };
export { sseRegistry, initWatcher, watchProject, unwatchProject };
