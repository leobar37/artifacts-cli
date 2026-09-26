import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let home: string;
let prevDir: string | undefined;
let prevHome: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "artifact-catalog-"));
  prevDir = process.env.ARTIFACT_DIR;
  prevHome = process.env.ARTIFACT_HOME;
  process.env.ARTIFACT_DIR = join(home, "dot");
  process.env.ARTIFACT_HOME = join(home, "store");
});

afterEach(() => {
  if (prevDir === undefined) delete process.env.ARTIFACT_DIR;
  else process.env.ARTIFACT_DIR = prevDir;
  if (prevHome === undefined) delete process.env.ARTIFACT_HOME;
  else process.env.ARTIFACT_HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

describe("agent catalog", () => {
  it("strips filesystem paths and serializes dates; unreadable projects stay empty", async () => {
    const { registerProject } = await import("../../utils/projects.js");
    const { buildRemoteCatalog } = await import("../catalog.js");

    const projA = mkdtempSync(join(tmpdir(), "artifact-cat-a-"));
    mkdirSync(join(projA, "docs", "artifacts", "demo"), { recursive: true });
    writeFileSync(join(projA, "docs", "artifacts", "demo", "index.html"), `<html><head><title>Cat A</title></head><body>a</body></html>`);
    const entryA = registerProject(projA);

    const projB = mkdtempSync(join(tmpdir(), "artifact-cat-b-"));
    const entryB = registerProject(projB); // no docs/artifacts dir at all

    try {
      const catalog = buildRemoteCatalog();
      expect(Date.parse(catalog.generatedAt)).not.toBeNaN();
      const byId = Object.fromEntries(catalog.projects.map((p) => [p.project.projectId, p]));
      const a = byId[entryA.projectId];
      expect(a.totalCount).toBe(1);
      const wire = a.artifacts[0];
      expect(wire.title).toBe("Cat A");
      expect(wire.createdAt).toEqual(expect.any(String));
      expect(wire.modifiedAt).toEqual(expect.any(String));
      // Sanitized: no absolute paths anywhere in the payload
      const payload = JSON.stringify(catalog);
      expect(payload).not.toContain(projA);
      expect(payload).not.toContain(projB);
      expect(payload).not.toContain("projectPath");
      expect(payload).not.toContain("/agent/");
      expect("path" in wire === false || typeof (wire as Record<string, unknown>).path === "undefined").toBe(true);
      // Unreadable project remains with zero artifacts instead of aborting
      expect(byId[entryB.projectId].totalCount).toBe(0);
      expect(byId[entryB.projectId].artifacts).toEqual([]);
    } finally {
      rmSync(projA, { recursive: true, force: true });
      rmSync(projB, { recursive: true, force: true });
    }
  });
});
