import { Command } from "commander";
import path from "path";
import chalk from "chalk";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { appendFileSync, existsSync, renameSync, rmSync, statSync } from "fs";
import { getBrokerToken, parseHttpBaseUrl } from "../../utils/broker-config.js";
import { getTailscaleIPv4 } from "../../utils/host.js";
import {
  getBrokerDaemon,
  isBrokerAlive,
  removeBrokerDaemon,
  setBrokerDaemon,
} from "../../utils/role-daemon.js";
import { startBrokerServer } from "../../broker/index.js";
import { addLogSink, createLogger } from "../../utils/logger.js";
import { installGlobalErrorHandlers } from "../../utils/daemon-log.js";

const log = createLogger("cli:broker");

const here = fileURLToPath(import.meta.url);
const __dirname = path.dirname(here);
/** CLI entrypoint next to this command file (index.ts from src/, index.js from dist/). */
const CLI_ENTRY = path.resolve(__dirname, `../index${path.extname(here)}`);

function brokerLogPath(): string {
  const home = process.env.ARTIFACT_DIR ?? path.join(process.env.HOME ?? "/tmp", ".artifact");
  return path.join(home, "broker.log");
}

function initBrokerLog(): void {
  const file = brokerLogPath();
  try {
    if (existsSync(file) && statSync(file).size >= 1024 * 1024) {
      try {
        rmSync(`${file}.1`);
      } catch {
        // no previous rotation
      }
      renameSync(file, `${file}.1`);
    }
  } catch {
    // best-effort
  }
  addLogSink((line) => {
    try {
      appendFileSync(file, `${line}\n`);
    } catch {
      // drop rather than crash
    }
  });
  log.info(`Logging to ${file}`);
}

function requireToken(): string {
  const token = getBrokerToken();
  if (!token) {
    log.error("ARTIFACT_BROKER_TOKEN is required to run the broker. Refusing to bind without it.");
    process.exit(1);
  }
  return token as string;
}

/** Resolve bind/display host for the broker. Local semantics by default. */
function resolveBrokerHost(options: { host?: string; tailscale?: boolean }): { displayHost: string; bindHost: string } {
  if (options.host) {
    const raw = options.host.trim();
    if (raw === "127.0.0.1" || raw === "localhost" || raw === "loopback") {
      return { displayHost: "localhost", bindHost: "127.0.0.1" };
    }
    return { displayHost: raw, bindHost: "0.0.0.0" };
  }
  if (options.tailscale) {
    const ip = getTailscaleIPv4();
    if (!ip) {
      log.error("`--tailscale` requested but `tailscale ip -4` could not be resolved. Refusing to fall back to localhost.");
      process.exit(1);
    }
    return { displayHost: ip, bindHost: ip };
  }
  return { displayHost: "localhost", bindHost: "127.0.0.1" };
}

async function waitForBrokerHealth(port: number, host: string, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const target = host === "0.0.0.0" ? "127.0.0.1" : host;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${target}:${port}/api/health`);
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { role?: string } | null;
        if (body?.role === "broker") return true;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

export function brokerCommand(program: Command) {
  const broker = program.command("broker").description("Run or inspect the central artifact broker");

  broker
    .command("serve")
    .description("Run the broker in the foreground (for supervisors)")
    .option("-p, --port <port>", "Port to listen on (default 7000, auto-retry next 10)")
    .option("--host <host>", "Host to advertise (IP/hostname)")
    .option("--tailscale", "Bind the exact Tailscale IPv4 (fails if unresolvable)")
    .action(async (options) => {
      const token = requireToken();
      const { displayHost, bindHost } = resolveBrokerHost(options);
      const port = options.port ? parseInt(options.port, 10) : 7000;

      initBrokerLog();
      installGlobalErrorHandlers();

      const existing = getBrokerDaemon();
      if (existing && (await isBrokerAlive(existing))) {
        log.info(`Broker already running at http://${existing.host}:${existing.port} (PID ${existing.pid})`);
        return;
      }
      if (existing) removeBrokerDaemon();

      try {
        const handle = await startBrokerServer({ port, host: bindHost, token });
        const bound = handle.port;
        setBrokerDaemon({ port: bound, host: displayHost, pid: process.pid, startedAt: new Date().toISOString() });
        log.info(`✓ Broker running at http://${displayHost}:${bound}`);

        const cleanup = async () => {
          log.warn("\nShutting down broker...");
          try {
            await handle.stop();
          } finally {
            removeBrokerDaemon();
            process.exit(0);
          }
        };
        process.on("SIGINT", () => void cleanup());
        process.on("SIGTERM", () => void cleanup());
        await new Promise(() => {});
      } catch (error) {
        log.error("Failed to start broker:", error);
        process.exit(1);
      }
    });

  broker
    .command("start")
    .description("Start the broker detached and print the central URL")
    .option("-p, --port <port>", "Port to listen on (default 7000, auto-retry next 10)")
    .option("--host <host>", "Host to advertise (IP/hostname)")
    .option("--tailscale", "Bind the exact Tailscale IPv4 (fails if unresolvable)")
    .option("--no-open", "Do not open browser automatically")
    .action(async (options) => {
      requireToken();
      const { displayHost, bindHost } = resolveBrokerHost(options);
      const port = options.port ? parseInt(options.port, 10) : 7000;

      const existing = getBrokerDaemon();
      if (existing && (await isBrokerAlive(existing))) {
        const url = `http://${existing.host}:${existing.port}/`;
        log.info(`Broker already running at ${chalk.cyan(url)}`);
        return;
      }
      if (existing) removeBrokerDaemon();

      const serveArgs = ["broker", "serve", "-p", String(port)];
      if (options.host) serveArgs.push("--host", options.host);
      else if (options.tailscale) serveArgs.push("--tailscale");
      else if (bindHost !== "127.0.0.1") serveArgs.push("--host", displayHost);

      log.info(`Starting broker at http://${displayHost}:${port}...`);
      const child = spawn(process.execPath, [CLI_ENTRY, ...serveArgs], {
        detached: true,
        stdio: "ignore",
        env: process.env,
      });
      child.unref();

      if (!(await waitForBrokerHealth(port, bindHost))) {
        // The child may have auto-retried to another port; check the lock.
        const locked = getBrokerDaemon();
        if (locked && (await isBrokerAlive(locked))) {
          const url = `http://${locked.host}:${locked.port}/`;
          log.info(`✓ Broker running at ${chalk.cyan(url)}`);
          return;
        }
        log.error(`Broker did not become healthy on port ${port}. Check logs with: ${chalk.cyan("artifact broker status")}`);
        process.exit(1);
      }
      const locked = getBrokerDaemon();
      const url = locked ? `http://${locked.host}:${locked.port}/` : `http://${displayHost}:${port}/`;
      log.info(`✓ Broker running. Central URL: ${chalk.cyan(url)}`);
      if (options.open) {
        const { isHeadless, openBrowser } = await import("../../utils/open-browser.js");
        if (!isHeadless()) await openBrowser(url);
        else log.info(`Headless server — open manually: ${chalk.cyan(url)}`);
      }
    });

  broker
    .command("stop")
    .description("Stop the broker daemon")
    .action(async () => {
      const daemon = getBrokerDaemon();
      if (!daemon) {
        log.info("No broker registered");
        return;
      }
      if (await isBrokerAlive(daemon)) {
        try {
          process.kill(daemon.pid, "SIGTERM");
          log.info(`✓ Stopped broker on port ${daemon.port} (PID ${daemon.pid})`);
        } catch {
          log.warn(`Could not signal PID ${daemon.pid}; removing lock`);
        }
      } else {
        log.info("Broker was already stopped");
      }
      removeBrokerDaemon();
    });

  broker
    .command("status")
    .description("Show broker status")
    .action(async () => {
      const daemon = getBrokerDaemon();
      if (!daemon) {
        log.info("Broker is not running (no lock file)");
        return;
      }
      const alive = await isBrokerAlive(daemon);
      log.info(alive
        ? `Broker running at http://${daemon.host}:${daemon.port} (PID ${daemon.pid}, started ${daemon.startedAt})`
        : `Broker lock is stale (was http://${daemon.host}:${daemon.port}, PID ${daemon.pid})`);
      if (!alive) process.exit(1);
    });

  broker
    .command("url")
    .description("Print the central broker URL")
    .action(async () => {
      const daemon = getBrokerDaemon();
      if (!daemon || !(await isBrokerAlive(daemon))) {
        log.warn("No broker running. Start with: artifact broker start");
        process.exit(1);
      }
      log.info(chalk.cyan(`http://${daemon.host}:${daemon.port}/`));
    });

  const remote = broker.command("remote").description("Manage registered remotes");
  remote
    .command("remove <remoteId>")
    .description("Remove an offline remote (online agents must expire first)")
    .action(async (remoteId: string) => {
      const token = requireToken();
      const daemon = getBrokerDaemon();
      if (!daemon || !(await isBrokerAlive(daemon))) {
        log.error("No broker running. Start with: artifact broker start");
        process.exit(1);
      }
      const target = daemon.host === "0.0.0.0" ? "127.0.0.1" : daemon.host;
      const res = await fetch(`http://${target}:${daemon.port}/api/remotes/${encodeURIComponent(remoteId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.ok) {
        log.info(`✓ Removed remote ${remoteId}`);
        return;
      }
      if (body?.error === "REMOTE_ONLINE") {
        log.error(`Remote ${remoteId} is still online. Stop its agent and wait for the lease to expire first.`);
      } else if (body?.error === "UNKNOWN_REMOTE") {
        log.error(`Unknown remote "${remoteId}".`);
      } else {
        log.error(`Failed to remove remote (HTTP ${res.status}: ${body?.error ?? res.statusText})`);
      }
      process.exit(1);
    });

  // Keep `parseHttpBaseUrl` referenced for future flag validation.
  void parseHttpBaseUrl;
}
