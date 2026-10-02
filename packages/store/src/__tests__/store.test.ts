import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "../local-store.js";

let home: string;
let work: string;
let store: LocalStore;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "artifact-home-"));
  work = mkdtempSync(join(tmpdir(), "artifact-work-"));
  process.env.ARTIFACT_HOME = join(home, "store");
  store = new LocalStore();
});

afterEach(() => {
  delete process.env.ARTIFACT_HOME;
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

describe("LocalStore", () => {
  it("put creates v001 and latest", () => {
    const result = store.put(work, { slug: "demo", title: "Demo", content: "<h1>hi</h1>" });
    expect(result.version).toBe("v001");
    expect(readFileSync(result.filePath, "utf-8")).toBe("<h1>hi</h1>");
  });

  it("second put bumps to v002 and keeps history", () => {
    store.put(work, { slug: "demo", title: "Demo", content: "one" });
    const second = store.put(work, { slug: "demo", title: "Demo", content: "two" });
    expect(second.version).toBe("v002");
    const current = store.get(work, "demo");
    expect(current?.content).toBe("two");
    const first = store.getVersion(work, "demo", "v001");
    expect(first?.content).toBe("one");
  });

  it("get returns null for unknown slug", () => {
    expect(store.get(work, "nope")).toBeNull();
    expect(store.getVersion(work, "demo", "v009")).toBeNull();
  });

  it("put links docs/artifacts/<slug>/index.html at latest", () => {
    const result = store.put(work, { slug: "demo", title: "Demo", content: "<p>v1</p>" });
    const docsFile = join(work, "docs", "artifacts", "demo", "index.html");
    expect(existsSync(docsFile)).toBe(true);
    expect(lstatSync(docsFile).isSymbolicLink()).toBe(true);
    expect(readFileSync(docsFile, "utf-8")).toBe("<p>v1</p>");
    store.put(work, { slug: "demo", title: "Demo", content: "<p>v2</p>" });
    expect(readFileSync(docsFile, "utf-8")).toBe("<p>v2</p>");
    expect(result.filePath).toContain("index.html");
  });

  it("put with format md stores versions as .md and links index.md", () => {
    const result = store.put(work, { slug: "notes", title: "Notes", content: "# Hi\n\nbody", format: "md" });
    expect(result.filePath).toContain("index.md");
    const current = store.get(work, "notes");
    expect(current?.format).toBe("md");
    expect(current?.content).toBe("# Hi\n\nbody");
    const docsMd = join(work, "docs", "artifacts", "notes", "index.md");
    expect(existsSync(docsMd)).toBe(true);
    expect(existsSync(join(work, "docs", "artifacts", "notes", "index.html"))).toBe(false);
    const versionFile = join(home, "store", store.dirFor(work).repoId, "notes", "versions", "v001.md");
    expect(readFileSync(versionFile, "utf-8")).toBe("# Hi\n\nbody");
  });

  it("put with format mdx stores .mdx versions", () => {
    store.put(work, { slug: "doc", title: "Doc", content: "export const x = 1\n\n# Doc", format: "mdx" });
    expect(store.get(work, "doc")?.format).toBe("mdx");
    const versionFile = join(home, "store", store.dirFor(work).repoId, "doc", "versions", "v001.mdx");
    expect(existsSync(versionFile)).toBe(true);
  });

  it("omitted format keeps the previous one; switching format replaces the docs link", () => {
    store.put(work, { slug: "demo", title: "Demo", content: "# v1", format: "md" });
    store.put(work, { slug: "demo", title: "Demo", content: "# v2" });
    expect(store.get(work, "demo")?.format).toBe("md");
    store.put(work, { slug: "demo", title: "Demo", content: "<p>html now</p>", format: "html" });
    expect(store.get(work, "demo")?.format).toBe("html");
    const docs = join(work, "docs", "artifacts", "demo");
    expect(existsSync(join(docs, "index.html"))).toBe(true);
    expect(existsSync(join(docs, "index.md"))).toBe(false);
  });

  it("legacy manifest without format reads as html", () => {
    store.put(work, { slug: "legacy", title: "Legacy", content: "<p>old</p>" });
    const { dir } = store.dirFor(work);
    const manifestPath = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    delete manifest.artifacts.legacy.format;
    // Simulate a pre-format store: bytes live in versions/v001.html.
    writeFileSync(join(dir, "legacy", "versions", "v001.html"), "<p>old</p>");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const found = store.get(work, "legacy");
    expect(found?.format).toBe("html");
    expect(found?.content).toBe("<p>old</p>");
  });

  it("putAsset writes store bytes and symlinks docs (subpaths allowed)", () => {
    store.put(work, { slug: "doc", title: "Doc", content: "# Hi", format: "mdx" });
    const result = store.putAsset(work, "doc", "shots/01.png", Buffer.from("pngbytes"));
    expect(result.name).toBe("shots/01.png");
    expect(readFileSync(join(work, "docs", "artifacts", "doc", "shots", "01.png"), "utf-8")).toBe("pngbytes");
    expect(lstatSync(join(work, "docs", "artifacts", "doc", "shots", "01.png")).isSymbolicLink()).toBe(true);
    const storeCopy = join(home, "store", store.dirFor(work).repoId, "doc", "assets", "shots", "01.png");
    expect(readFileSync(storeCopy, "utf-8")).toBe("pngbytes");
  });

  it("putAsset overwrites by name and rejects bad names/unknown slugs", () => {
    store.put(work, { slug: "doc", title: "Doc", content: "# Hi", format: "mdx" });
    store.putAsset(work, "doc", "logo.svg", Buffer.from("a"));
    store.putAsset(work, "doc", "logo.svg", Buffer.from("b"));
    expect(readFileSync(join(work, "docs", "artifacts", "doc", "logo.svg"), "utf-8")).toBe("b");
    expect(() => store.putAsset(work, "doc", "../escape.png", Buffer.from("x"))).toThrow("Invalid asset name");
    expect(() => store.putAsset(work, "nope", "a.png", Buffer.from("x"))).toThrow("NOT_FOUND");
  });

  it("list reflects manifest", () => {
    store.put(work, { slug: "a", title: "A", content: "x" });
    store.put(work, { slug: "b", title: "B", content: "y" });
    const items = store.list(work);
    expect(items.map((i) => i.slug).sort()).toEqual(["a", "b"]);
    expect(items.find((i) => i.slug === "a")?.latest).toBe("v001");
  });
});
