import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import plugin from "../index.js";

interface CapturedTool {
  name: string;
  execute: (id: string, params: unknown, signal: undefined, onUpdate: undefined, ctx: { cwd: string }) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }>;
}

/** Validated view of the tool's details payload (the plugin ships zod already). */
const CapabilitiesDetails = z.object({
  formats: z.array(z.object({ format: z.string() })),
  components: z.array(z.object({
    name: z.string(),
    props: z.array(z.object({ name: z.string() })),
  })),
  mermaid: z.object({ supported: z.boolean() }),
  guideUrl: z.string().nullable(),
});

let home: string;
let work: string;
let tools: Map<string, CapturedTool>;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "art-tools-home-"));
  work = mkdtempSync(join(tmpdir(), "art-tools-work-"));
  process.env.ARTIFACT_HOME = join(home, "store");
  process.env.ARTIFACT_DIR = join(home, "dir");
  tools = new Map();
  plugin({
    setLabel: () => {},
    on: () => {},
    registerTool: (def: CapturedTool) => tools.set(def.name, def),
    registerCommand: () => {},
  } as never);
});

afterEach(() => {
  delete process.env.ARTIFACT_HOME;
  delete process.env.ARTIFACT_DIR;
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

describe("artifact_asset tool", () => {
  it("stores bytes and returns the relative reference", async () => {
    const create = tools.get("artifact_create")!;
    await create.execute("c1", { slug: "doc", title: "Doc", content: "# Hi", format: "mdx" }, undefined, undefined, { cwd: work });
    const tool = tools.get("artifact_asset")!;
    const b64 = Buffer.from("pngbytes").toString("base64");
    const result = await tool.execute("a1", { slug: "doc", name: "shots/01.png", contentBase64: b64 }, undefined, undefined, { cwd: work });
    expect(result.content[0].text).toContain("OK doc/shots/01.png");
    expect(result.content[0].text).toContain("reference it as: shots/01.png");
  });

  it("reports NOT_FOUND for assets on unknown slugs", async () => {
    const tool = tools.get("artifact_asset")!;
    const result = await tool.execute("a2", { slug: "ghost", name: "a.png", contentBase64: "eA==" }, undefined, undefined, { cwd: work });
    expect(result.content[0].text).toContain("NOT_FOUND");
  });
});

describe("artifact_capabilities tool", () => {
  it("returns formats, components and mermaid for agents", async () => {
    const tool = tools.get("artifact_capabilities");
    expect(tool).toBeDefined();
    const result = await tool!.execute("t1", {}, undefined, undefined, { cwd: work });
    const details = CapabilitiesDetails.parse(result.details);
    expect(details.formats.map((f) => f.format)).toEqual(["html", "md", "mdx"]);
    expect(details.components.map((c) => c.name).sort()).toEqual(["Callout", "Chart", "Stat", "Stats", "Webframe"]);
    expect(details.mermaid.supported).toBe(true);
    expect(result.content[0].text).toContain("components:");
  });

  it("resolves the live guide url when a daemon lockfile exists", async () => {
    mkdirSync(join(home, "dir"), { recursive: true });
    writeFileSync(
      join(home, "dir", "daemon.json"),
      JSON.stringify({ port: 7000, host: "localhost", pid: 1, startedAt: new Date().toISOString() }),
    );
    const tool = tools.get("artifact_capabilities")!;
    const result = await tool.execute("t2", {}, undefined, undefined, { cwd: work });
    expect(CapabilitiesDetails.parse(result.details).guideUrl).toBe("http://localhost:7000/mdx-guide");
  });
});
