import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "fs";
import { homedir, hostname } from "os";
import { dirname, join } from "path";

export interface RemoteIdentity {
  remoteId: string;
  name: string;
  createdAt: string;
}

function artifactDir(): string {
  return process.env.ARTIFACT_DIR ?? join(homedir(), ".artifact");
}

export function remoteIdentityPath(): string {
  return join(artifactDir(), "remote.json");
}

/**
 * Load or create the stable machine identity. The ID is generated once and
 * never changes; an explicit name override only updates the display name.
 * A malformed file is a hard error naming the file (never silent replace).
 */
export function getOrCreateRemoteIdentity(nameOverride?: string): RemoteIdentity {
  const file = remoteIdentityPath();
  if (existsSync(file)) {
    let raw: string;
    try {
      raw = readFileSync(file, "utf-8");
    } catch (err) {
      throw new Error(`Cannot read remote identity file ${file}: ${(err as Error).message}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Remote identity file ${file} is malformed; fix or delete it manually`);
    }
    const obj = parsed as Partial<RemoteIdentity>;
    if (!obj || typeof obj.remoteId !== "string" || !obj.remoteId || typeof obj.name !== "string" || !obj.name) {
      throw new Error(`Remote identity file ${file} is malformed; fix or delete it manually`);
    }
    const identity: RemoteIdentity = {
      remoteId: obj.remoteId,
      name: obj.name,
      createdAt: typeof obj.createdAt === "string" ? obj.createdAt : new Date().toISOString(),
    };
    const nextName = (nameOverride ?? "").trim();
    if (nextName && nextName !== identity.name) {
      identity.name = nextName;
      atomicWrite(file, JSON.stringify(identity, null, 2));
    }
    return identity;
  }
  const identity: RemoteIdentity = {
    remoteId: randomUUID(),
    name: (nameOverride ?? "").trim() || hostname(),
    createdAt: new Date().toISOString(),
  };
  atomicWrite(file, JSON.stringify(identity, null, 2));
  return identity;
}

function atomicWrite(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}
