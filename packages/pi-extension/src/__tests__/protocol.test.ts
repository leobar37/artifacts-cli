import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "@tarileo/artifact-store";
import { artifactsProtocolHandler } from "../index";

let home: string;
let work: string;

function url(href: string) {
  const u = new URL(href);
  return { rawHost: u.hostname, hostname: u.hostname, pathname: u.pathname, href };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "art-proto-home-"));
  work = mkdtempSync(join(tmpdir(), "art-proto-work-"));
  process.env.ARTIFACT_HOME = join(home, "store");
  const store = new LocalStore();
  store.put(work, { slug: "demo", title: "Demo", html: "<h1>one</h1>" });
  store.put(work, { slug: "demo", title: "Demo", html: "<h1>two</h1>" });
});

afterEach(() => {
  delete process.env.ARTIFACT_HOME;
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

describe("artifacts:// protocol", () => {
  it("resolves latest", async () => {
    const res = await artifactsProtocolHandler.resolve(url("artifacts://demo"), { cwd: work });
    expect(res.content).toBe("<h1>two</h1>");
    expect(res.contentType).toBe("text/html");
  });

  it("resolves a pinned version", async () => {
    const res = await artifactsProtocolHandler.resolve(url("artifacts://demo/v001"), { cwd: work });
    expect(res.content).toBe("<h1>one</h1>");
  });

  it("rejects unknown slugs", async () => {
    await expect(artifactsProtocolHandler.resolve(url("artifacts://nope"), { cwd: work })).rejects.toThrow("Unknown artifact");
  });

  it("rejects traversal and subpaths", async () => {
    await expect(artifactsProtocolHandler.resolve(url("artifacts://demo/../x"), { cwd: work })).rejects.toThrow();
    await expect(artifactsProtocolHandler.resolve(url("artifacts://demo/a/b"), { cwd: work })).rejects.toThrow();
  });
});
