import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
    const result = store.put(work, { slug: "demo", title: "Demo", html: "<h1>hi</h1>" });
    expect(result.version).toBe("v001");
    expect(readFileSync(result.filePath, "utf-8")).toBe("<h1>hi</h1>");
  });

  it("second put bumps to v002 and keeps history", () => {
    store.put(work, { slug: "demo", title: "Demo", html: "one" });
    const second = store.put(work, { slug: "demo", title: "Demo", html: "two" });
    expect(second.version).toBe("v002");
    const current = store.get(work, "demo");
    expect(current?.html).toBe("two");
    const first = store.getVersion(work, "demo", "v001");
    expect(first?.html).toBe("one");
  });

  it("get returns null for unknown slug", () => {
    expect(store.get(work, "nope")).toBeNull();
    expect(store.getVersion(work, "demo", "v009")).toBeNull();
  });

  it("put links docs/artifacts/<slug>/index.html at latest", () => {
    const result = store.put(work, { slug: "demo", title: "Demo", html: "<p>v1</p>" });
    const docsFile = join(work, "docs", "artifacts", "demo", "index.html");
    expect(existsSync(docsFile)).toBe(true);
    expect(lstatSync(docsFile).isSymbolicLink()).toBe(true);
    expect(readFileSync(docsFile, "utf-8")).toBe("<p>v1</p>");
    store.put(work, { slug: "demo", title: "Demo", html: "<p>v2</p>" });
    expect(readFileSync(docsFile, "utf-8")).toBe("<p>v2</p>");
    expect(result.filePath).toContain("index.html");
  });

  it("list reflects manifest", () => {
    store.put(work, { slug: "a", title: "A", html: "x" });
    store.put(work, { slug: "b", title: "B", html: "y" });
    const items = store.list(work);
    expect(items.map((i) => i.slug).sort()).toEqual(["a", "b"]);
    expect(items.find((i) => i.slug === "a")?.latest).toBe("v001");
  });
});
