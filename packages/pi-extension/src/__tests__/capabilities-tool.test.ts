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

describe("artifact_capabilities tool", () => {
  it("returns formats, components and mermaid for agents", async () => {
    const tool = tools.get("artifact_capabilities");
    expect(tool).toBeDefined();
    const result = await tool!.execute("t1", {}, undefined, undefined, { cwd: work });
    const details = CapabilitiesDetails.parse(result.details);
    expect(details.formats.map((f) => f.format)).toEqual(["html", "md", "mdx"]);
    expect(details.components.map((c) => c.name)).toEqual(["Chart", "Stats", "Stat", "Callout"]);
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
