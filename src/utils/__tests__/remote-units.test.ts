import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let home: string;
let prevDir: string | undefined;
let prevBrokerUrl: string | undefined;
let prevRemoteName: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "artifact-remote-unit-"));
  prevDir = process.env.ARTIFACT_DIR;
  prevBrokerUrl = process.env.ARTIFACT_BROKER_URL;
  prevRemoteName = process.env.ARTIFACT_REMOTE_NAME;
  process.env.ARTIFACT_DIR = home;
  delete process.env.ARTIFACT_BROKER_URL;
  delete process.env.ARTIFACT_REMOTE_NAME;
});

afterEach(() => {
  if (prevDir === undefined) delete process.env.ARTIFACT_DIR;
  else process.env.ARTIFACT_DIR = prevDir;
  if (prevBrokerUrl === undefined) delete process.env.ARTIFACT_BROKER_URL;
  else process.env.ARTIFACT_BROKER_URL = prevBrokerUrl;
  if (prevRemoteName === undefined) delete process.env.ARTIFACT_REMOTE_NAME;
  else process.env.ARTIFACT_REMOTE_NAME = prevRemoteName;
  rmSync(home, { recursive: true, force: true });
});

describe("remote identity", () => {
  it("creates a stable id and preserves it across calls", async () => {
    const { getOrCreateRemoteIdentity } = await import("../remote-identity.js");
    const first = getOrCreateRemoteIdentity();
    expect(first.remoteId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.name.length).toBeGreaterThan(0);
    const second = getOrCreateRemoteIdentity();
    expect(second.remoteId).toBe(first.remoteId);
  });

  it("updates only the display name on override", async () => {
    const { getOrCreateRemoteIdentity } = await import("../remote-identity.js");
    const first = getOrCreateRemoteIdentity();
    const renamed = getOrCreateRemoteIdentity("edge-node");
    expect(renamed.remoteId).toBe(first.remoteId);
    expect(renamed.name).toBe("edge-node");
    const again = getOrCreateRemoteIdentity();
    expect(again.name).toBe("edge-node");
  });

  it("fails loudly on a malformed identity file", async () => {
    const { getOrCreateRemoteIdentity, remoteIdentityPath } = await import("../remote-identity.js");
    mkdirSync(home, { recursive: true });
    writeFileSync(remoteIdentityPath(), "{ not json");
    expect(() => getOrCreateRemoteIdentity()).toThrowError(/remote\.json.*malformed|malformed.*remote\.json/i);
    // Missing required fields also fail
    writeFileSync(remoteIdentityPath(), JSON.stringify({ name: "x" }));
    expect(() => getOrCreateRemoteIdentity()).toThrowError(/malformed/);
  });
});

describe("broker url helpers", () => {
  it("normalizes trailing slashes and subpaths", async () => {
    const { parseHttpBaseUrl } = await import("../broker-config.js");
    expect(parseHttpBaseUrl("http://100.64.0.1:7000/")).toBe("http://100.64.0.1:7000");
    expect(parseHttpBaseUrl("https://broker.tailnet:7000/prefix//")).toBe("https://broker.tailnet:7000/prefix");
  });

  it("rejects non-http, credentials, query, and fragment", async () => {
    const { parseHttpBaseUrl } = await import("../broker-config.js");
    expect(() => parseHttpBaseUrl("ftp://x/")).toThrowError(/http/);
    expect(() => parseHttpBaseUrl("http://user:pass@x/")).toThrowError(/credentials/);
    expect(() => parseHttpBaseUrl("http://x/?a=b")).toThrowError(/query/);
    expect(() => parseHttpBaseUrl("http://x/#frag")).toThrowError(/fragment/);
    expect(() => parseHttpBaseUrl("not a url")).toThrowError(/invalid/);
  });

  it("resolves broker url/name with flag > env > file precedence", async () => {
    const mod = await import("../broker-config.js");
    mod.writeBrokerFileConfig({ url: "http://file:7000", remoteName: "file-name" });
    expect(mod.resolveBrokerUrl()).toBe("http://file:7000");
    expect(mod.resolveRemoteName()).toBe("file-name");
    process.env.ARTIFACT_BROKER_URL = "http://env:7000";
    process.env.ARTIFACT_REMOTE_NAME = "env-name";
    expect(mod.resolveBrokerUrl()).toBe("http://env:7000");
    expect(mod.resolveRemoteName()).toBe("env-name");
    expect(mod.resolveBrokerUrl("http://flag:7000")).toBe("http://flag:7000");
  });

  it("never persists the token to disk", async () => {
    const mod = await import("../broker-config.js");
    process.env.ARTIFACT_BROKER_TOKEN = "super-secret";
    mod.writeBrokerFileConfig({ url: "http://x:7000" });
    const raw = readFileSync(join(home, "broker.json"), "utf-8");
    expect(raw).not.toContain("super-secret");
    delete process.env.ARTIFACT_BROKER_TOKEN;
  });
});

describe("bearer middleware", () => {
  it("accepts the exact token and rejects missing/wrong values", async () => {
    process.env.ARTIFACT_BROKER_TOKEN = "tok-123";
    const { isAuthorizedBearer } = await import("../../server/auth.js");
    expect(isAuthorizedBearer("Bearer tok-123")).toBe(true);
    expect(isAuthorizedBearer("Bearer wrong")).toBe(false);
    expect(isAuthorizedBearer(undefined)).toBe(false);
    expect(isAuthorizedBearer("Basic tok-123")).toBe(false);
    delete process.env.ARTIFACT_BROKER_TOKEN;
    expect(isAuthorizedBearer("Bearer tok-123")).toBe(false);
  });
});
