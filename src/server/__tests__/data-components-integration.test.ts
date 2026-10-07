import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createArtifactServer, type RunningArtifactServer } from "../index.js";
import { registerProject } from "../../utils/projects.js";
import { LocalStore } from "@tarileo/artifact-store";

/**
 * Full-flow integration for the JSON-backed data views (P-004): the bundled
 * fixture bundle is written as real store-backed artifacts in an isolated
 * temp project, then served through the same routes the dashboard uses.
 * Server-side contract only — hydration itself is covered by browser checks.
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "data-components");
const EXAMPLES = ["release-board", "plan-overview"] as const;

let home: string;
let projectDir: string;
let projectId: string;
let baseUrl: string;
let handle: RunningArtifactServer;
let prevDir: string | undefined;
let prevHome: string | undefined;

/** Real flow: versioned store entry (index.mdx symlink) + sibling JSON files. */
function seedExample(example: (typeof EXAMPLES)[number]): void {
  const source = join(FIXTURES, example);
  const entry = readFileSync(join(source, "index.mdx"), "utf-8");
  const put = new LocalStore().put(projectDir, {
    slug: example,
    title: example === "release-board" ? "Release board" : "Plan overview",
    content: entry,
    format: "mdx",
    type: "study",
  });
  expect(put.version).toBe("v001");
  const docsDir = join(projectDir, "docs", "artifacts", example);
  mkdirSync(docsDir, { recursive: true });
  for (const file of readdirSync(source)) {
    if (file === "index.mdx") continue;
    writeFileSync(join(docsDir, file), readFileSync(join(source, file)));
  }
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), "artifact-data-comp-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "artifact-data-comp-proj-"));
  prevDir = process.env.ARTIFACT_DIR;
  prevHome = process.env.ARTIFACT_HOME;
  process.env.ARTIFACT_DIR = join(home, "dot-artifact");
  process.env.ARTIFACT_HOME = join(home, "store");
  for (const example of EXAMPLES) seedExample(example);
  projectId = registerProject(projectDir).projectId;
  const port = 0; // OS-assigned: no parallel-test port races
  handle = await createArtifactServer({ port, host: "127.0.0.1", serveDashboard: false });
  baseUrl = `http://127.0.0.1:${handle.port}`;
}, 30000);

afterAll(async () => {
  await handle.stop();
  if (prevDir === undefined) delete process.env.ARTIFACT_DIR;
  else process.env.ARTIFACT_DIR = prevDir;
  if (prevHome === undefined) delete process.env.ARTIFACT_HOME;
  else process.env.ARTIFACT_HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

const docUrl = (slug: string): string => `${baseUrl}/p/${projectId}/artifacts/${slug}/index.mdx`;
const fileUrl = (slug: string, name: string): string =>
  `${baseUrl}/p/${projectId}/artifacts/${slug}/${name}`;

describe("data components through the artifact server", () => {
  it("serves both fixture examples as real store-backed mdx artifacts", async () => {
    for (const example of EXAMPLES) {
      const res = await fetch(`${baseUrl}/p/${projectId}/api/artifacts/${example}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { artifact: { title: string; format?: string } };
      expect(body.artifact.title).toBe(example === "release-board" ? "Release board" : "Plan overview");
    }
  });

  it("renders the release-board kanban as a hydratable src placeholder", async () => {
    const res = await fetch(docUrl("release-board"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const body = await res.text();
    expect(body).toContain("mv-format\">mdx");
    expect(body).toContain('class="mv-data mv-data-src"');
    expect(body).toContain('data-kind="kanban"');
    expect(body).toContain('data-src="tasks.json"');
    expect(body).toContain('data-title="Release board"');
    // Server ships the hydration boot script; no data is fetched or inlined.
    expect(body).toContain("mvHydrateDataSrc");
    expect(body).toContain("var cache = new Map()");
    // Never forward a client token with data fetches.
    expect(body).not.toContain("Authorization");
  });

  it("keeps plan-overview prose and renders both sibling-backed views", async () => {
    const res = await fetch(docUrl("plan-overview"));
    expect(res.status).toBe(200);
    const body = await res.text();
    // The goal stays regular Markdown prose with its heading anchor.
    expect(body).toContain('<h1 id="plan-overview">Plan overview');
    expect(body).toContain("read-only, snapshot-driven");
    expect(body).toContain('data-kind="tasklist"');
    expect(body).toContain('data-src="tasks.json"');
    expect(body).toContain('data-title="Work items"');
    expect(body).toContain('data-kind="properties"');
    expect(body).toContain('data-src="profile.json"');
    expect(body).toContain('data-title="Execution profile"');
    expect(body).toContain("mvHydrateDataSrc");
  });

  it("serves sibling JSON as application/json with the fixture bytes", async () => {
    for (const [slug, file] of [
      ["release-board", "tasks.json"],
      ["plan-overview", "tasks.json"],
      ["plan-overview", "profile.json"],
    ] as const) {
      const res = await fetch(fileUrl(slug, file));
      expect(res.status, `${slug}/${file}`).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(await res.text()).toBe(readFileSync(join(FIXTURES, slug, file), "utf-8"));
    }
    // Both datasets are valid version-1 documents.
    const tasks = JSON.parse(readFileSync(join(FIXTURES, "release-board", "tasks.json"), "utf-8")) as {
      version: number;
      columns: unknown[];
      items: unknown[];
    };
    expect(tasks.version).toBe(1);
    expect(tasks.columns.length).toBeGreaterThan(0);
    expect(tasks.items.length).toBeGreaterThan(0);
    const profile = JSON.parse(readFileSync(join(FIXTURES, "plan-overview", "profile.json"), "utf-8")) as {
      version: number;
      entries: unknown[];
    };
    expect(profile.version).toBe(1);
    expect(profile.entries.length).toBeGreaterThan(0);
  });

  it("keeps the malformed-JSON error contract reachable for the client", async () => {
    // Broken sibling + a sub-route document referencing it (folder standard).
    const docsDir = join(projectDir, "docs", "artifacts", "plan-overview");
    writeFileSync(join(docsDir, "broken.json"), '{ "version": 1, "items": [');
    writeFileSync(join(docsDir, "broken.mdx"), '<TaskList src="broken.json" title="Broken" />\n');

    const doc = await fetch(fileUrl("plan-overview", "broken.mdx"));
    expect(doc.status).toBe(200);
    const body = await doc.text();
    // Server-side: placeholder present, boot script present — the visible
    // error state itself is produced by the client runtime from this setup.
    expect(body).toContain('data-src="broken.json"');
    expect(body).toContain("mvHydrateDataSrc");
    expect(body).toContain("mv-data-error");
    expect(body).toContain("data could not be loaded");
    expect(body).toContain("JSON.parse");
    // The malformed bytes are still served as JSON for the client to reject.
    const raw = await fetch(fileUrl("plan-overview", "broken.json"));
    expect(raw.status).toBe(200);
    expect(raw.headers.get("content-type")).toBe("application/json; charset=utf-8");
  });

  it("preserves the theme query on data-view documents", async () => {
    const res = await fetch(`${docUrl("release-board")}?theme=light`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('data-theme="light"');
    expect(body).toContain('data-src="tasks.json"');
  });
});
