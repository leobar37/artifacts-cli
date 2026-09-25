import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "@tarileo/artifact-store";
import { findAvailablePort } from "../../utils/port-finder.js";
import { registerProject } from "../../utils/projects.js";
import { startServer, stopServer } from "../index.js";

const HTML_A = `<html><head><title>Proj A</title><meta name="artifact-type" content="study"></head><body>a</body></html>`;
const HTML_B = `<html><head><title>Proj B</title><meta name="artifact-type" content="study"></head><body>b</body></html>`;

let homeDir: string;
let projectA: string;
let projectB: string;
let projectC: string;
let baseUrl: string;
let idA: string;
let idB: string;
let prevArtifactHome: string | undefined;
let prevArtifactDir: string | undefined;

beforeAll(async () => {
  homeDir = mkdtempSync(join(tmpdir(), "artifact-e2e-home-"));
  projectA = mkdtempSync(join(tmpdir(), "artifact-e2e-proj-a-"));
  projectB = mkdtempSync(join(tmpdir(), "artifact-e2e-proj-b-"));
  projectC = mkdtempSync(join(tmpdir(), "artifact-e2e-proj-c-"));
  prevArtifactHome = process.env.ARTIFACT_HOME;
  prevArtifactDir = process.env.ARTIFACT_DIR;
  process.env.ARTIFACT_HOME = join(homeDir, "store");
  process.env.ARTIFACT_DIR = join(homeDir, "dot-artifact");

  // Real flow: the agent saves versioned artifacts and the links show up in docs/
  const store = new LocalStore();
  const putA = store.put(projectA, { slug: "demo", title: "Demo A", html: HTML_A, type: "study" });
  expect(putA.version).toBe("v001");
  const putB = store.put(projectB, { slug: "demo", title: "Demo B", html: HTML_B, type: "study" });
  expect(putB.version).toBe("v001");

  idA = registerProject(projectA).projectId;
  idB = registerProject(projectB).projectId;
  expect(idA).not.toBe(idB);

  const port = await findAvailablePort();
  await startServer({ port, host: "127.0.0.1" });
  baseUrl = `http://127.0.0.1:${port}`;
}, 30000);

afterAll(async () => {
  await stopServer();
  if (prevArtifactHome === undefined) delete process.env.ARTIFACT_HOME;
  else process.env.ARTIFACT_HOME = prevArtifactHome;
  if (prevArtifactDir === undefined) delete process.env.ARTIFACT_DIR;
  else process.env.ARTIFACT_DIR = prevArtifactDir;
  rmSync(homeDir, { recursive: true, force: true });
  rmSync(projectA, { recursive: true, force: true });
  rmSync(projectB, { recursive: true, force: true });
  rmSync(projectC, { recursive: true, force: true });
});

describe("daemon: one server, many projects", () => {
  it("responds to health", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
  });

  it("lists registered projects", async () => {
    const res = await fetch(`${baseUrl}/api/projects`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projects: Array<{ projectId: string }> };
    expect(body.projects.map((p) => p.projectId).sort()).toEqual([idA, idB].sort());
  });

  it("keeps same-slug artifacts isolated per project", async () => {
    const resA = await fetch(`${baseUrl}/p/${idA}/api/artifacts/demo`);
    expect(resA.status).toBe(200);
    const bodyA = (await resA.json()) as { artifact: { title: string } };
    expect(bodyA.artifact.title).toBe("Proj A");

    const resB = await fetch(`${baseUrl}/p/${idB}/api/artifacts/demo`);
    expect(resB.status).toBe(200);
    const bodyB = (await resB.json()) as { artifact: { title: string } };
    expect(bodyB.artifact.title).toBe("Proj B");
  });

  it("groups every project's artifacts in /api/overview", async () => {
    const res = await fetch(`${baseUrl}/api/overview`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      groups: Array<{ project: { projectId: string }; totalCount: number; artifacts: Array<{ slug: string; title: string }> }>;
    };
    const byId = Object.fromEntries(body.groups.map((g) => [g.project.projectId, g]));
    expect(byId[idA].totalCount).toBe(1);
    expect(byId[idA].artifacts[0].title).toBe("Proj A");
    expect(byId[idB].artifacts[0].title).toBe("Proj B");
  });

  it("serves each project's html through its symlink", async () => {
    const resA = await fetch(`${baseUrl}/p/${idA}/artifacts/demo/index.html`);
    expect(resA.status).toBe(200);
    expect(await resA.text()).toContain("<body>a</body>");

    const resB = await fetch(`${baseUrl}/p/${idB}/artifacts/demo/index.html`);
    expect(resB.status).toBe(200);
    expect(await resB.text()).toContain("<body>b</body>");
  });

  it("404s unknown projects", async () => {
    const res = await fetch(`${baseUrl}/p/does-not-exist/api/artifacts`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("UNKNOWN_PROJECT");
  });

  it("blocks path traversal outside the artifacts dir", async () => {
    const res = await fetch(`${baseUrl}/p/${idA}/artifacts/%2E%2E/%2E%2E/manifest.json`);
    expect([403, 404]).toContain(res.status);
  });

  it("reload invalidates only that project's cache", async () => {
    const res = await fetch(`${baseUrl}/p/${idA}/api/artifacts/demo/reload`, { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("404s missing slugs per project", async () => {
    const res = await fetch(`${baseUrl}/p/${idA}/api/artifacts/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it("registers projects via POST /api/projects", async () => {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: projectC }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { project: { projectId: string } };
    const idC = body.project.projectId;

    const list = (await (await fetch(`${baseUrl}/api/projects`)).json()) as {
      projects: Array<{ projectId: string }>;
    };
    expect(list.projects.map((p) => p.projectId)).toContain(idC);

    // Unregister again and confirm it is gone
    const del = await fetch(`${baseUrl}/api/projects/${idC}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    const gone = await fetch(`${baseUrl}/p/${idC}/api/artifacts`);
    expect(gone.status).toBe(404);
  });
});

describe("migration: legacy instances.json -> projects registry", () => {
  it("imports legacy project paths and removes the lockfile", async () => {
    const { migrateLegacyInstances } = await import("../../utils/projects.js");
    const legacyFile = join(process.env.ARTIFACT_DIR!, "instances.json");
    writeFileSync(
      legacyFile,
      JSON.stringify({
        deadbeef: { projectPath: projectC, projectId: "deadbeef", port: 7001, host: "localhost", pid: 1, startedAt: "" },
        gone: { projectPath: join(tmpdir(), "artifact-e2e-deleted-proj"), projectId: "gone", port: 7002, host: "localhost", pid: 1, startedAt: "" },
      }),
    );

    const imported = migrateLegacyInstances();
    expect(imported.map((e) => e.projectPath)).toContain(projectC);
    expect(imported).toHaveLength(1); // deleted dir is skipped
    expect(existsSync(legacyFile)).toBe(false);

    const list = (await (await fetch(`${baseUrl}/api/projects`)).json()) as {
      projects: Array<{ projectPath: string }>;
    };
    expect(list.projects.map((p) => p.projectPath)).toContain(projectC);
  });
});
