import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { request as httpRequest } from "node:http";
import { findAvailablePort } from "../../utils/port-finder.js";
import { startBrokerServer, type RunningBrokerServer } from "../index.js";

const TOKEN = "broker-e2e-token";
const SHARED_PROJECT = "shared-proj-id";
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "agent-fixture.ts");

let brokerHome: string;
let homeA: string;
let homeB: string;
let dirA: string;
let dirB: string;
let broker: RunningBrokerServer;
let brokerUrl: string;
let childA: ChildProcess;
let childB: ChildProcess;
let baseA = "";
let baseB = "";
let prevDir: string | undefined;

const htmlA = `<html><head><title>Shop A</title><meta name="artifact-type" content="study"></head><body>AGENT-A</body></html>`;
const htmlB = `<html><head><title>Shop B</title><meta name="artifact-type" content="study"></head><body>AGENT-B</body></html>`;

function seedProjects(home: string, dir: string, html: string): void {
  mkdirSync(join(dir, "docs", "artifacts", "demo"), { recursive: true });
  writeFileSync(join(dir, "docs", "artifacts", "demo", "index.html"), html);
  // Deliberately reuse the same projectId on both agents with different HTML.
  mkdirSync(home, { recursive: true });
  writeFileSync(
    join(home, "projects.json"),
    JSON.stringify({
      [SHARED_PROJECT]: { projectId: SHARED_PROJECT, projectPath: dir, name: "shop", addedAt: new Date().toISOString() },
    }),
  );
}

function startAgent(home: string, port: number, remoteId: string): Promise<{ child: ChildProcess; base: string }> {
  return new Promise((resolve, reject) => {
    // The fixture is TypeScript: run it with bun (vitest itself runs on node).
    const child = spawn("bun", [FIXTURE, home, String(port), remoteId, TOKEN], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ARTIFACT_BROKER_TOKEN: TOKEN },
    });
    let out = "";
    let errOut = "";
    const fail = (msg: string) => {
      child.kill("SIGTERM");
      reject(new Error(`${msg} stderr: ${errOut}`));
    };
    const timer = setTimeout(() => fail(`agent ${remoteId} did not print READY (got: ${out})`), 15000);
    child.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
      const m = /READY (\d+)/.exec(out);
      if (m) {
        clearTimeout(timer);
        resolve({ child, base: `http://127.0.0.1:${m[1]}` });
      }
    });
    child.stderr?.on("data", (d: Buffer) => {
      errOut += d.toString();
    });
    child.on("exit", (code) => {
      if (code !== 0 && code !== null && !out.includes("READY")) {
        clearTimeout(timer);
        reject(new Error(`agent ${remoteId} exited ${code}: ${out} stderr: ${errOut}`));
      }
    });
  });
}

function catalogFor(remoteId: string, base: string, name: string) {
  return {
    remoteId,
    name,
    baseUrl: base,
    version: "0.3.0-test",
    startedAt: new Date().toISOString(),
    catalog: {
      generatedAt: new Date().toISOString(),
      projects: [{
        project: { projectId: SHARED_PROJECT, name: "shop", addedAt: new Date().toISOString() },
        totalCount: 1,
        artifacts: [{
          slug: "demo", title: name, relativePath: "docs/artifacts/demo/index.html",
          type: "study", createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), size: 100,
        }],
      }],
    },
  };
}

const auth = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

beforeAll(async () => {
  brokerHome = mkdtempSync(join(tmpdir(), "artifact-broker-home-"));
  homeA = mkdtempSync(join(tmpdir(), "artifact-agentA-home-"));
  homeB = mkdtempSync(join(tmpdir(), "artifact-agentB-home-"));
  dirA = mkdtempSync(join(tmpdir(), "artifact-shopA-"));
  dirB = mkdtempSync(join(tmpdir(), "artifact-shopB-"));
  prevDir = process.env.ARTIFACT_DIR;
  process.env.ARTIFACT_DIR = brokerHome;

  seedProjects(homeA, dirA, htmlA);
  seedProjects(homeB, dirB, htmlB);

  const portA = await findAvailablePort();
  const portB = await findAvailablePort();
  const portBroker = await findAvailablePort();

  const [a, b] = await Promise.all([
    startAgent(homeA, portA, "remote-a"),
    startAgent(homeB, portB, "remote-b"),
  ]);
  childA = a.child;
  childB = b.child;
  baseA = a.base;
  baseB = b.base;

  broker = await startBrokerServer({ port: portBroker, host: "127.0.0.1", token: TOKEN });
  brokerUrl = `http://127.0.0.1:${broker.port}`;

  // Register both remotes through the real control plane (probes the agents).
  for (const [remoteId, base, name] of [["remote-a", baseA, "ubuntu-dev"], ["remote-b", baseB, "local-dev"]] as const) {
    const res = await fetch(`${brokerUrl}/api/remotes/register`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify(catalogFor(remoteId, base, name)),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { remote: { remoteId: string; status: string }; heartbeatIntervalMs: number };
    expect(body.remote.remoteId).toBe(remoteId);
    expect(body.heartbeatIntervalMs).toBe(15000);
  }
}, 60000);

afterAll(async () => {
  await broker?.stop();
  childA?.kill("SIGTERM");
  childB?.kill("SIGTERM");
  if (prevDir === undefined) delete process.env.ARTIFACT_DIR;
  else process.env.ARTIFACT_DIR = prevDir;
  for (const d of [brokerHome, homeA, homeB, dirA, dirB]) rmSync(d, { recursive: true, force: true });
});

describe("broker control plane", () => {
  it("rejects registration without/with a wrong token using the stable payload", async () => {
    const anon = await fetch(`${brokerUrl}/api/remotes/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(catalogFor("remote-x", baseA, "x")),
    });
    expect(anon.status).toBe(401);
    expect(await anon.json()).toEqual({ error: "UNAUTHORIZED" });

    const wrong = await fetch(`${brokerUrl}/api/remotes/register`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong", "Content-Type": "application/json" },
      body: JSON.stringify(catalogFor("remote-x", baseA, "x")),
    });
    expect(wrong.status).toBe(401);
  });

  it("rejects unreachable agents and identity mismatches without mutating", async () => {
    const dead = await fetch(`${brokerUrl}/api/remotes/register`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify(catalogFor("remote-dead", "http://127.0.0.1:1", "dead")),
    });
    expect(dead.status).toBe(422);
    expect(await dead.json()).toEqual({ error: "AGENT_UNREACHABLE" });

    const mismatch = await fetch(`${brokerUrl}/api/remotes/register`, {
      method: "POST",
      headers: auth,
      // baseA serves remote-a, not remote-impostor
      body: JSON.stringify(catalogFor("remote-impostor", baseA, "impostor")),
    });
    expect(mismatch.status).toBe(409);
    expect(await mismatch.json()).toEqual({ error: "REMOTE_ID_MISMATCH" });

    const list = (await (await fetch(`${brokerUrl}/api/remotes`)).json()) as { remotes: { remoteId: string }[] };
    expect(list.remotes.map((r) => r.remoteId).sort()).toEqual(["remote-a", "remote-b"]);
  });

  it("returns 404 UNKNOWN_REMOTE for unknown heartbeats", async () => {
    const res = await fetch(`${brokerUrl}/api/remotes/nope/heartbeat`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ version: "v", startedAt: new Date().toISOString(), catalog: catalogFor("nope", baseA, "n").catalog }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "UNKNOWN_REMOTE" });
  });
});

describe("broker data plane", () => {
  it("keeps identical project/slug namespaces isolated per remote", async () => {
    const a = await fetch(`${brokerUrl}/r/remote-a/p/${SHARED_PROJECT}/artifacts/demo/index.html`);
    expect(a.status).toBe(200);
    expect(a.headers.get("content-type")).toContain("text/html");
    expect(await a.text()).toContain("AGENT-A");

    const b = await fetch(`${brokerUrl}/r/remote-b/p/${SHARED_PROJECT}/artifacts/demo/index.html?v=2`);
    expect(b.status).toBe(200);
    expect(await b.text()).toContain("AGENT-B");

    const head = await fetch(`${brokerUrl}/r/remote-a/p/${SHARED_PROJECT}/artifacts/demo/index.html`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toContain("text/html");
  });

  it("serves catalog JSON without filesystem paths, tokens, or baseUrls", async () => {
    const overview = await fetch(`${brokerUrl}/api/overview`);
    expect(overview.status).toBe(200);
    const payload = await overview.text();
    expect(payload).not.toContain(TOKEN);
    expect(payload).not.toContain(baseA);
    expect(payload).not.toContain(dirA);
    expect(payload).not.toContain("projectPath");
    expect(payload).not.toContain(`"path"`);
    const body = JSON.parse(payload) as { remotes: { remote: { name: string; status: string }; projects: { project: { projectId: string; name: string }; totalCount: number }[] }[] };
    expect(body.remotes).toHaveLength(2);
    expect(body.remotes[0].projects[0].project.projectId).toBe(SHARED_PROJECT);

    const remotes = await (await fetch(`${brokerUrl}/api/remotes`)).json() as { remotes: unknown[] };
    expect(JSON.stringify(remotes)).not.toContain(TOKEN);

    const artifacts = await fetch(`${brokerUrl}/r/remote-a/p/${SHARED_PROJECT}/api/artifacts`);
    expect(artifacts.status).toBe(200);
    const aBody = (await artifacts.json()) as { artifacts: unknown[]; totalCount: number; lastScanAt: string };
    expect(aBody.totalCount).toBe(1);
    expect(Date.parse(aBody.lastScanAt)).not.toBeNaN();

    const badType = await fetch(`${brokerUrl}/r/remote-a/p/${SHARED_PROJECT}/api/artifacts?type=bogus`);
    expect(badType.status).toBe(400);

    const project = await (await fetch(`${brokerUrl}/r/remote-a/p/${SHARED_PROJECT}/api/project`)).json() as { project: Record<string, unknown> };
    expect(project.project.name).toBe("shop");
    expect("projectPath" in project.project).toBe(false);
  });
  it("rejects traversal, unknown remotes, and unknown projects before proxying", async () => {
    // fetch() and the HTTP stack normalize single-encoded %2E%2E dot segments
    // before route matching, so those requests can never reach the proxy:
    // assert they are answered without any upstream/agent content.
    const normalized = await fetch(`${brokerUrl}/r/remote-a/p/${SHARED_PROJECT}/artifacts/%2E%2E/%2E%2E/manifest.json`);
    const normalizedBody = await normalized.text();
    expect(normalizedBody).not.toContain("AGENT-A");
    expect(normalizedBody).not.toContain("AGENT-B");

    // Raw requests (node:http sends the path verbatim) exercise the broker's
    // own sanitize path: double-encoding and backslashes are 400, never proxied.
    const rawStatus = async (path: string): Promise<{ status: number; body: string }> =>
      new Promise((resolve, reject) => {
        const u = new URL(brokerUrl);
        const req = httpRequest({ host: u.hostname, port: Number(u.port), path, method: "GET" }, (res) => {
          let data = "";
          res.on("data", (c: Buffer) => {
            data += c.toString();
          });
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
        });
        req.on("error", reject);
        req.end();
      });
    const dbl = await rawStatus(`/r/remote-a/p/${SHARED_PROJECT}/artifacts/%252E%252E/manifest.json`);
    expect(dbl.status).toBe(400);
    expect(JSON.parse(dbl.body)).toEqual({ error: "INVALID_ARTIFACT_PATH" });
    const backslash = await rawStatus(`/r/remote-a/p/${SHARED_PROJECT}/artifacts/%5Cevil`);
    expect(backslash.status).toBe(400);

    const noRemote = await fetch(`${brokerUrl}/r/nope/p/${SHARED_PROJECT}/artifacts/demo/index.html`);
    expect(noRemote.status).toBe(404);
    expect(await noRemote.json()).toEqual({ error: "UNKNOWN_REMOTE" });

    const noProject = await fetch(`${brokerUrl}/r/remote-a/p/nope/artifacts/demo/index.html`);
    expect(noProject.status).toBe(404);
    expect(await noProject.json()).toEqual({ error: "UNKNOWN_PROJECT" });
  });
  it("forwards live SSE updates from the correct agent only", async () => {
    // Genuine async signal: the agent watcher debounces file writes (~300ms)
    // and chokidar delivery takes a moment; await the event with a deadline
    // rather than guessing a fixed sleep.
    const ctrl = new AbortController();
    const res = await fetch(`${brokerUrl}/r/remote-a/p/${SHARED_PROJECT}/api/events`, {
      headers: { Accept: "text/event-stream" },
      signal: ctrl.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const seen = (async () => {
      const deadline = Date.now() + 15000;
      for (;;) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error("timed out waiting for artifacts:update");
        const { done, value } = await reader.read();
        if (done) throw new Error("SSE stream closed before update");
        buf += decoder.decode(value, { stream: true });
        if (buf.includes("artifacts:update") && buf.includes('"slug":"demo"')) return buf;
      }
    })();

    // Trigger only agent A's watcher with a new file version.
    writeFileSync(join(dirA, "docs", "artifacts", "demo", "index.html"), htmlA.replace("AGENT-A", "AGENT-A-v2"));
    const event = await seen;
    expect(event).toContain("artifacts:update");
    ctrl.abort();
    await reader.cancel().catch(() => {});

    // Only agent A changed: B still serves its original bytes.
    const b = await fetch(`${brokerUrl}/r/remote-b/p/${SHARED_PROJECT}/artifacts/demo/index.html`);
    expect(await b.text()).toContain("AGENT-B");
  }, 30000);

  it("serves an mdx data-view artifact and its sibling json through the proxy", async () => {
    // Same-slug board seeded on both agents with different datasets: the
    // shared project/slug namespace must stay isolated per remote.
    const boardMdx = "# Release board\n\n<Kanban src=\"tasks.json\" title=\"Release board\" />\n";
    const tasksA = {
      version: 1,
      generatedAt: "2026-10-06T12:00:00Z",
      sourceLabel: "agent A snapshot",
      columns: [{ id: "pending", label: "Pending" }, { id: "done", label: "Done" }],
      items: [{ id: "A-1", title: "Agent A item", status: "pending" }],
    };
    const tasksB = {
      version: 1,
      generatedAt: "2026-10-06T12:00:00Z",
      sourceLabel: "agent B snapshot",
      columns: [{ id: "pending", label: "Pending" }, { id: "done", label: "Done" }],
      items: [{ id: "B-1", title: "Agent B item", status: "done" }],
    };
    for (const [dir, tasks] of [[dirA, tasksA], [dirB, tasksB]] as const) {
      mkdirSync(join(dir, "docs", "artifacts", "board"), { recursive: true });
      writeFileSync(join(dir, "docs", "artifacts", "board", "index.mdx"), boardMdx);
      writeFileSync(join(dir, "docs", "artifacts", "board", "tasks.json"), JSON.stringify(tasks, null, 2));
    }

    // The viewer page ships the hydratable placeholder + boot script.
    const page = await fetch(`${brokerUrl}/r/remote-a/p/${SHARED_PROJECT}/artifacts/board/index.mdx`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const body = await page.text();
    expect(body).toContain('class="mv-data mv-data-src"');
    expect(body).toContain('data-kind="kanban"');
    expect(body).toContain('data-src="tasks.json"');
    expect(body).toContain('data-title="Release board"');
    expect(body).toContain("mvHydrateDataSrc");

    // The sibling source the placeholder will fetch, same document directory.
    const json = await fetch(`${brokerUrl}/r/remote-a/p/${SHARED_PROJECT}/artifacts/board/tasks.json`);
    expect(json.status).toBe(200);
    expect(json.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await json.json()).toEqual(tasksA);

    // Same slug on the other remote keeps its own dataset.
    const jsonB = await fetch(`${brokerUrl}/r/remote-b/p/${SHARED_PROJECT}/artifacts/board/tasks.json`);
    expect(jsonB.status).toBe(200);
    expect(await jsonB.json()).toEqual(tasksB);
  }, 15000);
});

describe("broker offline lease", () => {
  it("retains the catalog when the lease expires and serves 503 without agent traffic", async () => {
    // Age remote-a's lease directly in the registry file (no 46s wall-clock wait).
    const file = join(brokerHome, "broker", "remotes.json");
    expect(existsSync(file)).toBe(true);
    const data = JSON.parse(readFileSync(file, "utf-8")) as Record<string, { lastSeenAt: string }>;
    data["remote-a"].lastSeenAt = new Date(Date.now() - 60_000).toISOString();
    writeFileSync(file, JSON.stringify(data, null, 2));

    const list = (await (await fetch(`${brokerUrl}/api/remotes`)).json()) as {
      remotes: { remoteId: string; status: string; lastSeenAt: string }[];
    };
    const a = list.remotes.find((r) => r.remoteId === "remote-a")!;
    expect(a.status).toBe("offline");

    // Catalog retained for offline remotes.
    const overview = (await (await fetch(`${brokerUrl}/api/overview`)).json()) as {
      remotes: { remote: { remoteId: string }; projects: unknown[] }[];
    };
    expect(overview.remotes.find((g) => g.remote.remoteId === "remote-a")!.projects).toHaveLength(1);

    // Preview short-circuits before any agent request.
    const preview = await fetch(`${brokerUrl}/r/remote-a/p/${SHARED_PROJECT}/artifacts/demo/index.html`);
    expect(preview.status).toBe(503);
    const body = (await preview.json()) as { error: string; remoteId: string; lastSeenAt: string };
    expect(body.error).toBe("REMOTE_OFFLINE");
    expect(body.remoteId).toBe("remote-a");
    expect(body.lastSeenAt).toBe(a.lastSeenAt);

    // The other remote stays fully usable.
    const b = await fetch(`${brokerUrl}/r/remote-b/p/${SHARED_PROJECT}/artifacts/demo/index.html`);
    expect(b.status).toBe(200);
  });

  it("recovers on heartbeat without duplicating the remote", async () => {
    const hb = await fetch(`${brokerUrl}/api/remotes/remote-a/heartbeat`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ version: "0.3.0-test", startedAt: new Date().toISOString(), catalog: catalogFor("remote-a", baseA, "ubuntu-dev").catalog }),
    });
    expect(hb.status).toBe(200);

    const list = (await (await fetch(`${brokerUrl}/api/remotes`)).json()) as { remotes: { remoteId: string; status: string }[] };
    expect(list.remotes.filter((r) => r.remoteId === "remote-a")).toHaveLength(1);
    expect(list.remotes.find((r) => r.remoteId === "remote-a")!.status).toBe("online");

    const preview = await fetch(`${brokerUrl}/r/remote-a/p/${SHARED_PROJECT}/artifacts/demo/index.html`);
    expect(preview.status).toBe(200);
  });

  it("only removes offline remotes via the authenticated control plane", async () => {
    const anonDel = await fetch(`${brokerUrl}/api/remotes/remote-b`, { method: "DELETE" });
    expect(anonDel.status).toBe(401);

    const onlineDel = await fetch(`${brokerUrl}/api/remotes/remote-b`, { method: "DELETE", headers: auth });
    expect(onlineDel.status).toBe(409);
    expect(await onlineDel.json()).toEqual({ error: "REMOTE_ONLINE" });

    const unknownDel = await fetch(`${brokerUrl}/api/remotes/nope`, { method: "DELETE", headers: auth });
    expect(unknownDel.status).toBe(404);

    // Age remote-a again, then removal succeeds.
    const file = join(brokerHome, "broker", "remotes.json");
    const data = JSON.parse(readFileSync(file, "utf-8")) as Record<string, { lastSeenAt: string }>;
    data["remote-a"].lastSeenAt = new Date(Date.now() - 60_000).toISOString();
    writeFileSync(file, JSON.stringify(data, null, 2));

    const del = await fetch(`${brokerUrl}/api/remotes/remote-a`, { method: "DELETE", headers: auth });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ success: true, remoteId: "remote-a" });
  });
});
