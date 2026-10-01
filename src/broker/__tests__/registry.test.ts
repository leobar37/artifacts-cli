import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RemoteCatalog } from "../../types/artifact.js";
import { REMOTE_ONLINE_THRESHOLD_MS } from "../../utils/broker-config.js";

let home: string;
let prevDir: string | undefined;

const catalog = (names: string[] = ["site"]): RemoteCatalog => ({
  generatedAt: new Date().toISOString(),
  projects: names.map((name) => ({
    project: { projectId: `id-${name}`, name, addedAt: new Date().toISOString() },
    totalCount: 1,
    artifacts: [{
      slug: "demo", title: `Demo ${name}`, relativePath: "docs/artifacts/demo/index.html",
      type: "study", format: "md", createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), size: 10,
    }],
  })),
});

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "artifact-registry-"));
  prevDir = process.env.ARTIFACT_DIR;
  process.env.ARTIFACT_DIR = home;
});

afterEach(() => {
  if (prevDir === undefined) delete process.env.ARTIFACT_DIR;
  else process.env.ARTIFACT_DIR = prevDir;
  rmSync(home, { recursive: true, force: true });
});

describe("remote registry", () => {
  it("persists atomically and replaces mutable fields on re-register", async () => {
    const reg = await import("../remote-registry.js");
    const now = Date.now();
    const clock = () => now;
    reg.registerRemote({ remoteId: "r1", name: "one", baseUrl: "http://a:7001", version: "0.1", startedAt: new Date(now).toISOString(), catalog: catalog() }, clock);
    const file = join(home, "broker", "remotes.json");
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf-8"))["r1"].name).toBe("one");
    // No sibling temp files leak
    expect(existsSync(`${file}.${process.pid}.tmp`)).toBe(false);

    reg.registerRemote({ remoteId: "r1", name: "one-renamed", baseUrl: "http://b:7001", version: "0.2", startedAt: new Date(now).toISOString(), catalog: catalog(["other"]) }, clock);
    const got = reg.getRemote("r1");
    expect(got?.name).toBe("one-renamed");
    expect(got?.baseUrl).toBe("http://b:7001");
    expect(listOf(reg, clock)).toHaveLength(1);
  });

  it("derives online/offline at the 45s lease boundary", async () => {
    const reg = await import("../remote-registry.js");
    const t0 = 1_700_000_000_000;
    reg.registerRemote({ remoteId: "r1", name: "n", baseUrl: "http://a:7001", version: "v", startedAt: new Date(t0).toISOString(), catalog: catalog() }, () => t0);
    // Exactly at the boundary: online; 1ms later: offline. Lease expiry never deletes.
    expect(reg.listRemoteSummaries(() => t0 + REMOTE_ONLINE_THRESHOLD_MS)[0].status).toBe("online");
    expect(reg.listRemoteSummaries(() => t0 + REMOTE_ONLINE_THRESHOLD_MS + 1)[0].status).toBe("offline");
    expect(reg.getRemote("r1")).not.toBeNull();
    const overview = reg.buildOverview(() => t0 + REMOTE_ONLINE_THRESHOLD_MS + 1);
    expect(overview[0].projects).toHaveLength(1); // retained catalog
  });

  it("sorts online first, then case-insensitive name", async () => {
    const reg = await import("../remote-registry.js");
    const t0 = 1_700_000_000_000;
    reg.registerRemote({ remoteId: "zeta", name: "Zeta", baseUrl: "http://a", version: "v", startedAt: new Date(t0).toISOString(), catalog: catalog() }, () => t0);
    reg.registerRemote({ remoteId: "alpha", name: "alpha", baseUrl: "http://b", version: "v", startedAt: new Date(t0).toISOString(), catalog: catalog() }, () => t0);
    // Both online: alpha first
    expect(reg.listRemoteSummaries(() => t0).map((s) => s.remoteId)).toEqual(["alpha", "zeta"]);
    // Expire alpha only via heartbeat clock skew: re-register zeta later
    reg.registerRemote({ remoteId: "zeta", name: "Zeta", baseUrl: "http://a", version: "v", startedAt: new Date(t0).toISOString(), catalog: catalog() }, () => t0 + 30_000);
    const names = reg.listRemoteSummaries(() => t0 + 46_000).map((s) => `${s.remoteId}:${s.status}`);
    expect(names).toEqual(["zeta:online", "alpha:offline"]);
  });

  it("heartbeat updates the lease; unknown ids return null; remove deletes", async () => {
    const reg = await import("../remote-registry.js");
    const t0 = 1_700_000_000_000;
    expect(reg.heartbeatRemote("nope", { version: "v", startedAt: new Date(t0).toISOString(), catalog: catalog() }, () => t0)).toBeNull();
    reg.registerRemote({ remoteId: "r1", name: "n", baseUrl: "http://a", version: "v1", startedAt: new Date(t0).toISOString(), catalog: catalog() }, () => t0);
    const hb = reg.heartbeatRemote("r1", { version: "v2", startedAt: new Date(t0).toISOString(), catalog: catalog(["x", "y"]) }, () => t0 + 10_000);
    expect(hb?.version).toBe("v2");
    expect(reg.listRemoteSummaries(() => t0 + 10_000)[0].artifactCount).toBe(2);
    expect(reg.removeRemote("r1")).toBe(true);
    expect(reg.removeRemote("r1")).toBe(false);
  });
});

function listOf(reg: { listRemoteSummaries: (c?: () => number) => unknown[] }, clock: () => number) {
  return reg.listRemoteSummaries(clock);
}
