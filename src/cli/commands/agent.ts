import { Command } from "commander";
import path from "path";
import chalk from "chalk";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { getBrokerToken, parseHttpBaseUrl, readBrokerFileConfig, resolveBrokerUrl, resolveRemoteName, writeBrokerFileConfig, HEARTBEAT_INTERVAL_MS } from "../../utils/broker-config.js";
import { getTailscaleIPv4 } from "../../utils/host.js";
import { getOrCreateRemoteIdentity } from "../../utils/remote-identity.js";
import {
  getAgentDaemon,
  isAgentAlive,
  removeAgentDaemon,
  setAgentDaemon,
} from "../../utils/role-daemon.js";
import { createArtifactServer } from "../../server/index.js";
import { startBrokerClient } from "../../agent/broker-client.js";
import { createLogger } from "../../utils/logger.js";
import { initDaemonLog, installGlobalErrorHandlers } from "../../utils/daemon-log.js";

const log = createLogger("cli:agent");

const here = fileURLToPath(import.meta.url);
const __dirname = path.dirname(here);
/** CLI entrypoint next to this command file (index.ts from src/, index.js from dist/). */
const CLI_ENTRY = path.resolve(__dirname, `../index${path.extname(here)}`);

const ARTIFACT_VERSION = process.env.ARTIFACT_VERSION || "0.1.0";

function requireToken(): string {
  const token = getBrokerToken();
  if (!token) {
    log.error("ARTIFACT_BROKER_TOKEN is required to run the agent. Refusing to bind without it.");
    process.exit(1);
  }
  return token as string;
}

function resolveAgentHost(options: { host?: string; tailscale?: boolean }): { displayHost: string; bindHost: string } {
  // Explicit --host wins; agent defaults to Tailscale; fail rather than fall back.
  if (options.host) {
    const raw = options.host.trim();
    if (raw === "127.0.0.1" || raw === "localhost" || raw === "loopback") {
      return { displayHost: "localhost", bindHost: "127.0.0.1" };
    }
    return { displayHost: raw, bindHost: "0.0.0.0" };
  }
  const wantTailscale = options.tailscale ?? true;
  if (wantTailscale) {
    const ip = getTailscaleIPv4();
    if (!ip) {
      log.error("Agent defaults to `--tailscale` but `tailscale ip -4` could not be resolved. Pass --host <host> explicitly or fix Tailscale.");
      process.exit(1);
    }
    return { displayHost: ip, bindHost: ip };
  }
  return { displayHost: "localhost", bindHost: "127.0.0.1" };
}

async function waitForAgentLock(timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lock = getAgentDaemon();
    if (lock) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function checkAgentHealth(host: string, port: number, token: string, remoteId: string): Promise<boolean> {
  try {
    const target = host === "0.0.0.0" ? "127.0.0.1" : host;
    const res = await fetch(`http://${target}:${port}/agent/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { remoteId?: string } | null;
    return body?.remoteId === remoteId;
  } catch {
    return false;
  }
}

async function waitForBrokerOnline(brokerUrl: string, remoteId: string, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${brokerUrl.replace(/\/+$/, "")}/api/remotes`);
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { remotes?: { remoteId: string; status: string }[] } | null;
        const found = body?.remotes?.find((r) => r.remoteId === remoteId);
        if (found?.status === "online") return true;
      }
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export function agentCommand(program: Command) {
  const agent = program.command("agent").description("Expose this machine's artifacts to a central broker");

  agent
    .command("serve")
    .description("Run the agent in the foreground (for supervisors)")
    .option("--broker <url>", "Broker base URL (or ARTIFACT_BROKER_URL / broker.json)")
    .option("--name <name>", "Remote display name (or ARTIFACT_REMOTE_NAME / broker.json)")
    .option("-p, --port <port>", "Port to listen on (default 7001, auto-retry next 10)")
    .option("--host <host>", "Host to advertise (IP/hostname)")
    .option("--tailscale", "Bind the exact Tailscale IPv4 (default; fails if unresolvable)")
    .option("--no-tailscale", "Do not use Tailscale; bind loopback unless --host is given")
    .action(async (options) => {
      const token = requireToken();
      const rawBroker = options.broker ?? resolveBrokerUrl();
      if (!rawBroker) {
        log.error("No broker URL. Pass --broker <url> or set ARTIFACT_BROKER_URL.");
        process.exit(1);
      }
      let brokerUrl: string;
      try {
        brokerUrl = parseHttpBaseUrl(rawBroker, "Broker URL");
      } catch (err) {
        log.error((err as Error).message);
        process.exit(1);
      }
      const nameOverride = options.name ?? resolveRemoteName() ?? undefined;
      const identity = getOrCreateRemoteIdentity(nameOverride);
      const { displayHost, bindHost } = resolveAgentHost(options);
      const port = options.port ? parseInt(options.port, 10) : 7001;

      // Persist non-secret config (URL + name); the token is never persisted.
      const fileCfg = readBrokerFileConfig();
      writeBrokerFileConfig({
        url: brokerUrl,
        remoteName: nameOverride ?? fileCfg.remoteName ?? identity.name,
      });

      initDaemonLog();
      installGlobalErrorHandlers();

      const existing = getAgentDaemon();
      if (existing && (await isAgentAlive(existing))) {
        log.info(`Agent already running at http://${existing.host}:${existing.port} (PID ${existing.pid})`);
        return;
      }
      if (existing) removeAgentDaemon();

      const startedAt = new Date().toISOString();
      const baseUrl = `http://${displayHost}:${port}`;
      try {
        const server = await createArtifactServer({
          port,
          host: bindHost,
          role: "agent",
          remoteId: identity.remoteId,
          remoteToken: token,
          serveDashboard: false,
        });
        const bound = server.port;
        const actualBase = `http://${displayHost}:${bound}`;
        setAgentDaemon({
          remoteId: identity.remoteId,
          brokerUrl,
          host: displayHost,
          port: bound,
          pid: process.pid,
          startedAt,
        });
        log.info(`✓ Agent running at ${actualBase} (remoteId ${identity.remoteId})`);

        const client = startBrokerClient({
          brokerUrl,
          token,
          remoteId: identity.remoteId,
          name: identity.name,
          baseUrl: actualBase,
          version: ARTIFACT_VERSION,
          startedAt,
          heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
        });
        void baseUrl;

        const cleanup = async () => {
          log.warn("\nShutting down agent...");
          try {
            await client.stop();
            await server.stop();
          } finally {
            removeAgentDaemon();
            process.exit(0);
          }
        };
        process.on("SIGINT", () => void cleanup());
        process.on("SIGTERM", () => void cleanup());
        await new Promise(() => {});
      } catch (error) {
        log.error("Failed to start agent:", error);
        process.exit(1);
      }
    });

  agent
    .command("start")
    .description("Start the agent detached and register with the broker")
    .option("--broker <url>", "Broker base URL (or ARTIFACT_BROKER_URL / broker.json)")
    .option("--name <name>", "Remote display name (or ARTIFACT_REMOTE_NAME / broker.json)")
    .option("-p, --port <port>", "Port to listen on (default 7001, auto-retry next 10)")
    .option("--host <host>", "Host to advertise (IP/hostname)")
    .option("--tailscale", "Bind the exact Tailscale IPv4 (default; fails if unresolvable)")
    .option("--no-tailscale", "Do not use Tailscale; bind loopback unless --host is given")
    .action(async (options) => {
      const token = requireToken();
      const rawBroker = options.broker ?? resolveBrokerUrl();
      if (!rawBroker) {
        log.error("No broker URL. Pass --broker <url> or set ARTIFACT_BROKER_URL.");
        process.exit(1);
      }
      let brokerUrl: string;
      try {
        brokerUrl = parseHttpBaseUrl(rawBroker, "Broker URL");
      } catch (err) {
        log.error((err as Error).message);
        process.exit(1);
      }
      const nameOverride = options.name ?? resolveRemoteName() ?? undefined;
      const identity = getOrCreateRemoteIdentity(nameOverride);
      writeBrokerFileConfig({ url: brokerUrl, remoteName: nameOverride ?? readBrokerFileConfig().remoteName ?? identity.name });

      const existing = getAgentDaemon();
      if (existing && (await isAgentAlive(existing))) {
        log.info(`Agent already running at http://${existing.host}:${existing.port} (PID ${existing.pid})`);
        log.info(`Central URL: ${chalk.cyan(`${brokerUrl}/`)}`);
        return;
      }
      if (existing) removeAgentDaemon();

      const port = options.port ? parseInt(options.port, 10) : 7001;
      const serveArgs = ["agent", "serve", "--broker", brokerUrl, "-p", String(port)];
      if (nameOverride) serveArgs.push("--name", nameOverride);
      if (options.host) serveArgs.push("--host", options.host);
      else if (options.tailscale) serveArgs.push("--tailscale");
      else if (options.tailscale === false) serveArgs.push("--no-tailscale");

      log.info(`Starting agent "${identity.name}"...`);
      const child = spawn(process.execPath, [CLI_ENTRY, ...serveArgs], {
        detached: true,
        stdio: "ignore",
        env: process.env,
      });
      child.unref();

      if (!(await waitForAgentLock(15000))) {
        log.error("Agent did not write its lock file in time. Check agent logs; verify ARTIFACT_BROKER_TOKEN and --host/--tailscale.");
        process.exit(1);
      }
      const lock = getAgentDaemon();
      if (!lock) {
        log.error("Agent lock disappeared. Check agent logs.");
        process.exit(1);
      }
      const healthy = await checkAgentHealth(lock.host, lock.port, token, lock.remoteId);
      const online = await waitForBrokerOnline(brokerUrl, lock.remoteId, 15000);
      if (!healthy || !online) {
        log.error(`Agent checks failed (agent health: ${healthy ? "ok" : "FAIL"}, broker online: ${online ? "ok" : "FAIL"}).`);
        log.error(`Agent: http://${lock.host}:${lock.port}/agent/health  Broker: ${brokerUrl}/api/remotes`);
        process.exit(1);
      }
      log.info(`✓ Agent "${identity.name}" online. Central URL: ${chalk.cyan(`${brokerUrl}/`)}`);
    });

  agent
    .command("stop")
    .description("Stop the agent daemon")
    .action(async () => {
      const daemon = getAgentDaemon();
      if (!daemon) {
        log.info("No agent registered");
        return;
      }
      if (await isAgentAlive(daemon)) {
        try {
          process.kill(daemon.pid, "SIGTERM");
          log.info(`✓ Stopped agent on port ${daemon.port} (PID ${daemon.pid})`);
        } catch {
          log.warn(`Could not signal PID ${daemon.pid}; removing lock`);
        }
      } else {
        log.info("Agent was already stopped");
      }
      removeAgentDaemon();
    });

  agent
    .command("status")
    .description("Show agent status")
    .action(async () => {
      const daemon = getAgentDaemon();
      if (!daemon) {
        log.info("Agent is not running (no lock file)");
        return;
      }
      const alive = await isAgentAlive(daemon);
      log.info(alive
        ? `Agent running at http://${daemon.host}:${daemon.port} (remoteId ${daemon.remoteId}, broker ${daemon.brokerUrl}, PID ${daemon.pid})`
        : `Agent lock is stale (was http://${daemon.host}:${daemon.port}, PID ${daemon.pid})`);
      if (!alive) process.exit(1);
    });
}
