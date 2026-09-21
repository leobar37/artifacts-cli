import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";
import type { Server } from "http";
import { fileURLToPath } from "url";
import path from "path";
import healthRouter from "./routes/health.js";
import artifactsRouter from "./routes/artifacts.js";
import projectRouter from "./routes/project.js";
import chatRouter from "./routes/chat-pi.js";
import { registry } from "../handlers/registry.js";
import { sseRegistry } from "./sse.js";
import { startWatcher } from "./watcher.js";
import { invalidateCache } from "./routes/artifacts.js";
import {
  SessionStore,
  FileSystemPersistence,
  getSessionStoragePath,
} from "./session/index.js";
import { getProjectId } from "../utils/project.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("server");

interface ServerOptions {
  port: number;
  projectPath: string;
  artifactsPath: string;
}

let server: ReturnType<typeof import("@hono/node-server").serve> | null = null;
let sessionStore: SessionStore | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer(options: ServerOptions): Promise<Server> {
  const app = new Hono();

  process.env.ARTIFACT_PROJECT_PATH = options.projectPath;
  process.env.ARTIFACT_ARTIFACTS_PATH = options.artifactsPath;

  // Initialize session store with persistence
  const projectId = getProjectId(options.projectPath);
  const storagePath = getSessionStoragePath(projectId);
  const persistence = new FileSystemPersistence({ storageDir: storagePath });
  sessionStore = new SessionStore({ persistence });

  // Load existing sessions from disk
  const restoredCount = await sessionStore.loadFromDisk();
  if (restoredCount > 0) {
    log.info(`Restored ${restoredCount} persistent sessions`);
  }

  // Clean up orphaned sessions (sessions for deleted artifacts)
  const artifactsPath = options.artifactsPath;
  if (persistence && restoredCount > 0) {
    try {
      const { existsSync, readdirSync } = await import("fs");
      const { join } = await import("path");

      // Get list of existing artifact slugs
      const existingSlugs: string[] = [];
      if (existsSync(artifactsPath)) {
        const entries = readdirSync(artifactsPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const hasIndex = existsSync(
              join(artifactsPath, entry.name, "index.html"),
            );
            const hasTsx = existsSync(
              join(artifactsPath, entry.name, "content.tsx"),
            );
            if (hasIndex || hasTsx) {
              existingSlugs.push(entry.name);
            }
          }
        }
      }

      // Find and cleanup orphaned sessions
      const orphaned = await persistence.validateSessions(existingSlugs);
      if (orphaned.length > 0) {
        const cleaned = await persistence.cleanupOrphaned(orphaned);
        log.info(`Cleaned up ${cleaned} orphaned sessions`);
      }
    } catch (err) {
      log.warn(
        `Failed to cleanup orphaned sessions: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Make session store available to routes via environment or global
  (global as any).__SESSION_STORE__ = sessionStore;

  await registry.loadAll();

  // API routes
  app.route("/api/health", healthRouter);
  app.route("/api/artifacts", artifactsRouter);
  app.route("/api/project", projectRouter);
  app.route("/api/chat", chatRouter);

  // SSE endpoint for live artifact updates
  app.get("/api/events", (c) => {
    return streamSSE(c, async (stream) => {
      const clientId = sseRegistry.add(stream);
      log.info(`client connected: ${clientId}`);

      stream.onAbort(() => {
        sseRegistry.remove(clientId);
        log.info(`client disconnected: ${clientId}`);
      });

      // Keep alive until abort
      await new Promise(() => {});
    });
  });

  // Start file watcher
  startWatcher({
    artifactsPath: options.artifactsPath,
    onInvalidate: invalidateCache,
    onBroadcast: (slug: string) => {
      sseRegistry.broadcast("artifacts:update", {
        slug,
        lastScanAt: new Date().toISOString(),
      });
    },
  });

  // Static files for artifacts
  app.use(
    "/artifacts/*",
    serveStatic({
      root: options.artifactsPath,
      rewriteRequestPath: (p: string) => {
        const cleanPath = p.replace(/^\/artifacts/, "").split("?")[0];
        return cleanPath;
      },
    }),
  );

  // Dashboard static files
  const dashboardPath = path.join(__dirname, "../../dist/dashboard");
  app.use("/*", serveStatic({ root: dashboardPath }));

  // SPA fallback
  app.get("*", async (c) => {
    const fs = await import("fs");
    const html = fs.readFileSync(
      path.join(dashboardPath, "index.html"),
      "utf-8",
    );
    return c.html(html);
  });

  const { serve } = await import("@hono/node-server");
  const http = await import("http");

  const MAX_PORT_ATTEMPTS = 10;

  async function tryStart(port: number): Promise<Server> {
    return new Promise((resolve, reject) => {
      const srv = serve(
        { fetch: app.fetch, port, hostname: "127.0.0.1" },
        () => {
          log.info(`Server running at http://localhost:${port}`);
          server = srv as any;
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

export async function stopServer(): Promise<void> {
  if (!server) return;

  return new Promise((resolve) => {
    (server as any).close(() => {
      server = null;
      resolve();
    });
  });
}
