import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import path from "path";
import type { InstanceLock } from "../types/artifact.js";

const LOCKFILE_DIR = path.join(homedir(), ".artifact");
const LOCKFILE_PATH = path.join(LOCKFILE_DIR, "instances.json");

function ensureLockfileDir(): void {
  if (!existsSync(LOCKFILE_DIR)) {
    mkdirSync(LOCKFILE_DIR, { recursive: true });
  }
}

export function readLockfile(): Map<string, InstanceLock> {
  ensureLockfileDir();
  if (!existsSync(LOCKFILE_PATH)) {
    return new Map();
  }
  try {
    const content = readFileSync(LOCKFILE_PATH, "utf-8");
    const data = JSON.parse(content) as Record<string, InstanceLock>;
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
}

export function writeLockfile(instances: Map<string, InstanceLock>): void {
  ensureLockfileDir();
  const data = Object.fromEntries(instances);
  writeFileSync(LOCKFILE_PATH, JSON.stringify(data, null, 2));
}

export function getInstance(projectId: string): InstanceLock | null {
  const instances = readLockfile();
  return instances.get(projectId) || null;
}

export function setInstance(lock: InstanceLock): void {
  const instances = readLockfile();
  instances.set(lock.projectId, lock);
  writeLockfile(instances);
}

export function removeInstance(projectId: string): void {
  const instances = readLockfile();
  instances.delete(projectId);
  writeLockfile(instances);
}

export function getAllInstances(): InstanceLock[] {
  const instances = readLockfile();
  return Array.from(instances.values());
}
