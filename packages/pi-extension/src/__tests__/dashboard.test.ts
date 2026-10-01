import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import {
  buildLinks,
  getProjectId,
  probeDaemon,
  readDaemon,
  resolveDashboard,
  slugify,
  viewLine,
  NO_DAEMON_HINT,
} from "../dashboard";

let home: string;
let work: string;
let savedHome: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "art-dash-home-"));
  work = mkdtempSync(join(tmpdir(), "art-dash-work-"));
  savedHome = process.env.ARTIFACT_DIR;
  process.env.ARTIFACT_DIR = home;
});

afterEach(() => {
  if (savedHome === undefined) delete process.env.ARTIFACT_DIR;
  else process.env.ARTIFACT_DIR = savedHome;
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

describe("slugify", () => {
  it("matches the CLI normalization", () => {
    expect(slugify("Auth Summary!!")).toBe("auth-summary");
    expect(slugify("  control-de-caja ")).toBe("control-de-caja");
  });
});

describe("getProjectId", () => {
  it("matches the CLI sha256-of-canonical-dir scheme", () => {
    const expected = createHash("sha256").update(realpathSync(work)).digest("hex").slice(0, 16);
    expect(getProjectId(work)).toBe(expected);
  });
});

describe("readDaemon", () => {
  it("returns null without a lock file", () => {
    expect(readDaemon()).toBeNull();
  });

  it("parses host/port and defaults a blank host", () => {
    writeFileSync(join(home, "daemon.json"), JSON.stringify({ host: "100.83.90.33", port: 7000 }));
    expect(readDaemon()).toEqual({ host: "100.83.90.33", port: 7000 });
    writeFileSync(join(home, "daemon.json"), JSON.stringify({ host: "  ", port: 7001 }));
    expect(readDaemon()).toEqual({ host: "localhost", port: 7001 });
  });

  it("returns null for garbage", () => {
    writeFileSync(join(home, "daemon.json"), "{nope");
    expect(readDaemon()).toBeNull();
    writeFileSync(join(home, "daemon.json"), JSON.stringify({ port: -1 }));
    expect(readDaemon()).toBeNull();
  });
});

describe("buildLinks", () => {
  it("builds overview/project/artifact URLs", () => {
    const links = buildLinks("localhost", 7000, "abc123", "remote-broker");
    expect(links.overview).toBe("http://localhost:7000/");
    expect(links.project).toBe("http://localhost:7000/p/abc123/");
    expect(links.artifact).toBe("http://localhost:7000/p/abc123/?select=remote-broker");
  });

  it("omits artifact without a slug", () => {
    expect(buildLinks("h", 1, "id").artifact).toBeUndefined();
  });
});

describe("resolveDashboard", () => {
  it("reports NO_DAEMON without a lock", async () => {
    const res = await resolveDashboard(work, "whatever");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe(NO_DAEMON_HINT);
  });

  it("reports NO_DAEMON when the lock is stale (nothing answers)", async () => {
    writeFileSync(join(home, "daemon.json"), JSON.stringify({ host: "127.0.0.1", port: 9 }));
    const res = await resolveDashboard(work);
    expect(res.ok).toBe(false);
  });

  it("resolves links against a live daemon", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      writeFileSync(join(home, "daemon.json"), JSON.stringify({ host: "127.0.0.1", port }));
      const res = await resolveDashboard(work, "remote-broker");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.links.overview).toBe(`http://127.0.0.1:${port}/`);
        expect(res.links.artifact).toContain("?select=remote-broker");
      }
    } finally {
      server.close();
    }
  });
});

describe("probeDaemon", () => {
  it("is false when nothing listens", async () => {
    await expect(probeDaemon("127.0.0.1", 9, 500)).resolves.toBe(false);
  });
});

describe("viewLine", () => {
  it("is empty without a lock (callers fall back to the hint)", () => {
    expect(viewLine(work, "x")).toBe("");
  });

  it("returns the artifact URL with a lock (optimistic, no probe)", () => {
    writeFileSync(join(home, "daemon.json"), JSON.stringify({ host: "localhost", port: 7000 }));
    expect(viewLine(work, "remote-broker")).toContain("?select=remote-broker");
  });
});
