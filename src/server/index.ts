import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";
import type { Server } from "http";
import { fileURLToPath } from "url";
import path from "path";
import healthRouter from "./routes/health.js";
import artifactsRouter from "./routes/artifacts.js";
import projectRouter from "./routes/project.js";
import { registry } from "../handlers/registry.js";
import { sseRegistry } from "./sse.js";
import { startWatcher } from "./watcher.js";
import { invalidateCache } from "./routes/artifacts.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("server");

interface ServerOptions {
  port: number;
  projectPath: string;
  artifactsPath: string;
  host?: string;
}

let server: ReturnType<typeof import("@hono/node-server").serve> | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer(options: ServerOptions): Promise<Server> {
  const app = new Hono();

  process.env.ARTIFACT_PROJECT_PATH = options.projectPath;
  process.env.ARTIFACT_ARTIFACTS_PATH = options.artifactsPath;

  await registry.loadAll();

  // API routes
  app.route("/api/health", healthRouter);
  app.route("/api/artifacts", artifactsRouter);
  app.route("/api/project", projectRouter);

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
  const bindHost = options.host ?? "127.0.0.1";

  async function tryStart(port: number): Promise<Server> {
    return new Promise((resolve, reject) => {
      const srv = serve(
        { fetch: app.fetch, port, hostname: bindHost },
        () => {
          log.info(`Server running at http://${bindHost}:${port}`);
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
