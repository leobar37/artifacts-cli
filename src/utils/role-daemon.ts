import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import http from "http";
import type { AgentDaemonInfo, BrokerDaemonInfo } from "../types/artifact.js";

function homeDir(): string {
  return process.env.ARTIFACT_DIR ?? join(homedir(), ".artifact");
}

function ensureDir(): void {
  mkdirSync(homeDir(), { recursive: true });
}

function brokerLockPath(): string {
  return join(homeDir(), "broker-daemon.json");
}

function agentLockPath(): string {
  return join(homeDir(), "agent-daemon.json");
}

function readJson<T>(file: string): T | null {
  try {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

// --- Broker lock -------------------------------------------------------------

export function getBrokerDaemon(): BrokerDaemonInfo | null {
  ensureDir();
  return readJson<BrokerDaemonInfo>(brokerLockPath());
}

export function setBrokerDaemon(info: BrokerDaemonInfo): void {
  ensureDir();
  writeFileSync(brokerLockPath(), JSON.stringify(info, null, 2));
}

export function removeBrokerDaemon(): void {
  try {
    if (existsSync(brokerLockPath())) rmSync(brokerLockPath());
  } catch {
    // best-effort
  }
}

/** True when the broker answers /api/health AND its PID is still running. */
export function isBrokerAlive(info: BrokerDaemonInfo): Promise<boolean> {
  return healthAndPid(info.host, info.port, info.pid);
}

// --- Agent lock --------------------------------------------------------------

export function getAgentDaemon(): AgentDaemonInfo | null {
  ensureDir();
  return readJson<AgentDaemonInfo>(agentLockPath());
}

export function setAgentDaemon(info: AgentDaemonInfo): void {
  ensureDir();
  writeFileSync(agentLockPath(), JSON.stringify(info, null, 2));
}

export function removeAgentDaemon(): void {
  try {
    if (existsSync(agentLockPath())) rmSync(agentLockPath());
  } catch {
    // best-effort
  }
}

/** True when the agent answers /api/health AND its PID is still running. */
export function isAgentAlive(info: AgentDaemonInfo): Promise<boolean> {
  return healthAndPid(info.host, info.port, info.pid);
}

function healthAndPid(host: string, port: number, pid: number): Promise<boolean> {
  return new Promise((resolve) => {
    const target = host === "0.0.0.0" ? "127.0.0.1" : host;
    const req = http.get(`http://${target}:${port}/api/health`, (res) => {
      if (res.statusCode === 200) {
        try {
          process.kill(pid, 0);
          resolve(true);
        } catch {
          resolve(false);
        }
      } else {
        resolve(false);
      }
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.setTimeout(2000);
  });
}
