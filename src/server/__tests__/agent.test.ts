import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findAvailablePort } from "../../utils/port-finder.js";
import { createArtifactServer, type RunningArtifactServer } from "../index.js";

const TOKEN = "agent-contract-token";
const REMOTE_ID = "contract-remote-1";

let home: string;
let projectDir: string;
let projectId: string;
let server: RunningArtifactServer;
let baseUrl: string;
let prevDir: string | undefined;
let prevHome: string | undefined;

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), "artifact-agent-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "artifact-agent-proj-"));
  prevDir = process.env.ARTIFACT_DIR;
  prevHome = process.env.ARTIFACT_HOME;
  process.env.ARTIFACT_DIR = home;
  process.env.ARTIFACT_HOME = join(home, "store");

  mkdirSync(join(projectDir, "docs", "artifacts", "demo"), { recursive: true });
  writeFileSync(join(projectDir, "docs", "artifacts", "demo", "index.html"), `<html><head><title>Agent Demo</title></head><body>agent</body></html>`);
  const { registerProject } = await import("../../utils/projects.js");
  projectId = registerProject(projectDir).projectId;

  const port = await findAvailablePort();
  server = await createArtifactServer({
    port,
    host: "127.0.0.1",
    role: "agent",
    remoteId: REMOTE_ID,
    remoteToken: TOKEN,
    serveDashboard: false,
  });
  baseUrl = `http://127.0.0.1:${server.port}`;
}, 30000);

afterAll(async () => {
  await server?.stop();
  if (prevDir === undefined) delete process.env.ARTIFACT_DIR;
  else process.env.ARTIFACT_DIR = prevDir;
  if (prevHome === undefined) delete process.env.ARTIFACT_HOME;
  else process.env.ARTIFACT_HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

const auth = { Authorization: `Bearer ${TOKEN}` };

describe("agent contract", () => {
  it("answers authenticated health with its remoteId", async () => {
    const anon = await fetch(`${baseUrl}/agent/health`);
    expect(anon.status).toBe(401);
    expect(await anon.json()).toEqual({ error: "UNAUTHORIZED" });

    const wrong = await fetch(`${baseUrl}/agent/health`, { headers: { Authorization: "Bearer nope" } });
    expect(wrong.status).toBe(401);

    const ok = await fetch(`${baseUrl}/agent/health`, { headers: auth });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { status: string; role: string; remoteId: string; version: string };
    expect(body).toMatchObject({ status: "ok", role: "agent", remoteId: REMOTE_ID });
  });

  it("serves preview bytes and HEAD through /agent with the same MIME", async () => {
    const url = `${baseUrl}/agent/p/${projectId}/artifacts/demo/index.html`;
    const anon = await fetch(url);
    expect(anon.status).toBe(401);

    const get = await fetch(url, { headers: auth });
    expect(get.status).toBe(200);
    expect(get.headers.get("content-type")).toContain("text/html");
    expect(await get.text()).toContain("<body>agent</body>");

    const head = await fetch(url, { method: "HEAD", headers: auth });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toContain("text/html");
  });

  it("rejects traversal without touching the filesystem", async () => {
    const res = await fetch(`${baseUrl}/agent/p/${projectId}/artifacts/%2E%2E/%2E%2E/manifest.json`, { headers: auth });
    expect([400, 403, 404]).toContain(res.status);
  });

  it("404s unknown projects", async () => {
    const res = await fetch(`${baseUrl}/agent/p/does-not-exist/artifacts/demo/index.html`, { headers: auth });
    expect(res.status).toBe(404);
  });

  it("streams project SSE", async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${baseUrl}/agent/p/${projectId}/events`, { headers: { ...auth, Accept: "text/event-stream" }, signal: ctrl.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    ctrl.abort();
    await res.body?.cancel().catch(() => {});
  });

  it("serves the guide and mermaid bundle publicly on the agent origin", async () => {
    const guide = await fetch(`${baseUrl}/mdx-guide`);
    expect(guide.status).toBe(200);
    expect(await guide.text()).toContain('aria-label="Secciones"');
    const bundle = await fetch(`${baseUrl}/assets/mermaid.min.js`);
    expect(bundle.status).toBe(200);
  });
  it("does not serve the dashboard SPA", async () => {
    const res = await fetch(`${baseUrl}/`, { headers: auth });
    expect(res.status).toBe(404);
  });
});
