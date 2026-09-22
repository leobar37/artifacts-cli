import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "@tarileo/artifact-store";
import { findAvailablePort } from "../../utils/port-finder.js";
import { startServer, stopServer } from "../index.js";

const HTML = `<html><head><title>E2E Demo</title><meta name="artifact-type" content="study"></head><body>e2e</body></html>`;

let projectDir: string;
let homeDir: string;
let baseUrl: string;
let prevProjectPath: string | undefined;
let prevArtifactsPath: string | undefined;

beforeAll(async () => {
  projectDir = mkdtempSync(join(tmpdir(), "artifact-e2e-proj-"));
  homeDir = mkdtempSync(join(tmpdir(), "artifact-e2e-home-"));
  process.env.ARTIFACT_HOME = join(homeDir, "store");
  prevProjectPath = process.env.ARTIFACT_PROJECT_PATH;
  prevArtifactsPath = process.env.ARTIFACT_ARTIFACTS_PATH;

  // Real flow: the agent saves a versioned artifact and the link shows up in docs/
  const store = new LocalStore();
  const result = store.put(projectDir, { slug: "e2e-demo", title: "E2E Demo", html: HTML, type: "study" });
  expect(result.version).toBe("v001");

  const port = await findAvailablePort();
  await startServer({
    port,
    projectPath: projectDir,
    artifactsPath: join(projectDir, "docs", "artifacts"),
    host: "127.0.0.1",
  });
  baseUrl = `http://127.0.0.1:${port}`;
}, 30000);

afterAll(async () => {
  await stopServer();
  if (prevProjectPath === undefined) delete process.env.ARTIFACT_PROJECT_PATH;
  else process.env.ARTIFACT_PROJECT_PATH = prevProjectPath;
  if (prevArtifactsPath === undefined) delete process.env.ARTIFACT_ARTIFACTS_PATH;
  else process.env.ARTIFACT_ARTIFACTS_PATH = prevArtifactsPath;
  delete process.env.ARTIFACT_HOME;
  rmSync(projectDir, { recursive: true, force: true });
  rmSync(homeDir, { recursive: true, force: true });
});

describe("e2e: store -> symlink -> server -> dashboard API", () => {
  it("responds to health", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
  });

  it("lists the artifact created via store", async () => {
    const res = await fetch(`${baseUrl}/api/artifacts`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { artifacts: Array<{ slug: string; title: string }> ; totalCount: number };
    expect(body.totalCount).toBe(1);
    expect(body.artifacts[0].slug).toBe("e2e-demo");
    expect(body.artifacts[0].title).toBe("E2E Demo");
  });

  it("detail with handler", async () => {
    const res = await fetch(`${baseUrl}/api/artifacts/e2e-demo`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { artifact: { slug: string }; handler: { type: string } | null };
    expect(body.artifact.slug).toBe("e2e-demo");
    expect(body.handler?.type).toBe("study");
  });

  it("serves the html through the symlink", async () => {
    const res = await fetch(`${baseUrl}/artifacts/e2e-demo/index.html`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("e2e");
  });

  it("reload invalidates cache", async () => {
    const res = await fetch(`${baseUrl}/api/artifacts/e2e-demo/reload`, { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("404 on missing slug", async () => {
    const res = await fetch(`${baseUrl}/api/artifacts/does-not-exist`);
    expect(res.status).toBe(404);
  });
});
