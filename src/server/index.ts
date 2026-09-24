import { Hono, type Context, type Next } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";
import type { Server } from "http";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import healthRouter from "./routes/health.js";
import artifactsRouter, { invalidateCache } from "./routes/artifacts.js";
import projectRouter from "./routes/project.js";
import { registry } from "../handlers/registry.js";
import { sseRegistry } from "./sse.js";
import {
  initWatcher,
  stopWatcher,
  unwatchProject,
  watchProject,
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

interface ServerOptions {
  port: number;
  host?: string;
}

let server: Server | null = null;
let actualPort = 0;

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
  const project = projectId === "" ? null : getProject(projectId);
  if (!project) {
    return c.json(
      { error: "UNKNOWN_PROJECT", message: "Project not registered. Run `artifact start` in the project directory." },
      404,
    );
  }
  c.set("project", project);
  await next();
}

export async function startServer(options: ServerOptions): Promise<Server> {
  const app = new Hono();

  await registry.loadAll();

  // --- Global routes ---------------------------------------------------------
  app.route("/api/health", healthRouter);

  app.get("/api/projects", (c) => {
    return c.json({ projects: listProjects() });
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
    watchProject(entry.projectId, getProjectArtifactsPath(projectPath));
    return c.json({ project: entry });
  });

  app.delete("/api/projects/:projectId", (c) => {
    const projectId = c.req.param("projectId");
    const removed = unregisterProject(projectId);
    if (!removed) {
      return c.json({ error: "NOT_FOUND", message: "Project not registered" }, 404);
    }
    unwatchProject(projectId);
    invalidateCache(projectId);
    sseRegistry.removeByProject(projectId);
    return c.json({ success: true, projectId });
  });

  // --- Project-scoped routes (/p/:projectId/...) ------------------------------
  const projectApp = new Hono<ProjectEnv>();
  projectApp.use("*", resolveProject);

  projectApp.route("/api/artifacts", artifactsRouter);
  projectApp.route("/api/project", projectRouter);

  projectApp.get("/api/events", (c) => {
    const project = c.get("project");
    return streamSSE(c, async (stream) => {
      const clientId = sseRegistry.add(stream, project.projectId);
      log.info(`client connected: ${clientId} (${project.projectId})`);

      stream.onAbort(() => {
        sseRegistry.remove(clientId);
        log.info(`client disconnected: ${clientId}`);
      });

      // Keep alive until abort
      await new Promise(() => {});
    });
  });

  // Static artifact files with traversal protection (root is per-request).
  projectApp.get("/artifacts/*", (c) => {
    const project = c.get("project");
    const base = getProjectArtifactsPath(project.projectPath);
    const prefix = `/p/${project.projectId}/artifacts`;
    const raw = decodeURIComponent(c.req.path.slice(prefix.length).split("?")[0] || "/");
    const file = path.resolve(base, `.${raw.startsWith("/") ? raw : `/${raw}`}`);
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
  });

  app.route("/p/:projectId", projectApp);

  // --- File watcher for every registered project ------------------------------
  initWatcher({
    onInvalidate: (projectId) => invalidateCache(projectId),
    onBroadcast: (projectId, slug) => {
      sseRegistry.broadcastTo(projectId, "artifacts:update", {
        slug,
        lastScanAt: new Date().toISOString(),
      });
    },
  });
  for (const entry of listProjects()) {
    watchProject(entry.projectId, getProjectArtifactsPath(entry.projectPath));
  }

  // --- Dashboard static files --------------------------------------------------
  const dashboardPath = path.join(__dirname, "../../dist/dashboard");
  app.use("/*", serveStatic({ root: dashboardPath }));

  // SPA fallback (also serves the dashboard for /p/:projectId deep links)
  app.get("*", async (c) => {
    const fs = await import("fs");
    const html = fs.readFileSync(
      path.join(dashboardPath, "index.html"),
      "utf-8",
    );
    return c.html(html);
  });

  const { serve } = await import("@hono/node-server");

  const MAX_PORT_ATTEMPTS = 10;
  const bindHost = options.host ?? "127.0.0.1";

  async function tryStart(port: number): Promise<Server> {
    return new Promise((resolve, reject) => {
    const srv = serve(
      { fetch: app.fetch, port, hostname: bindHost },
      () => {
        log.info(`Server running at http://${bindHost}:${port}`);
        server = srv as unknown as Server;
        actualPort = port;
        resolve(srv as unknown as Server);
      },
    );

    srv.on("error", (err: NodeJS.ErrnoException) => {
      if (
        err.code === "EADDRINUSE" &&
        port < options.port + MAX_PORT_ATTEMPTS
      ) {
        log.info(`Port ${port} is in use, trying ${port + 1}...`);
        tryStart(port + 1)
          .then(resolve)
          .catch(reject);
      } else {
        reject(new Error(`Failed to start server: ${err.message}`));
      }
    });
    });
  }

  return tryStart(options.port);
}

/** Port the running server actually bound to (after auto-retry). */
export function getActualPort(): number {
  return actualPort;
}

export async function stopServer(): Promise<void> {
  stopWatcher();
  invalidateCache();
  if (!server) return;

  return new Promise((resolve) => {
    server!.close(() => {
      server = null;
      resolve();
    });
  });
}
