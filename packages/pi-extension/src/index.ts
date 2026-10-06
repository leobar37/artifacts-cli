import { z } from "zod";
import { LocalStore, getViewerCapabilities } from "@tarileo/artifact-store";
import type { ArtifactEntry } from "@tarileo/artifact-store";
import { NO_DAEMON_HINT, buildLinks, getProjectId, readDaemon, resolveDashboard, slugify, viewLine } from "./dashboard.js";

interface ToolContext {
  cwd: string;
}

interface UiHandle {
  notify: (message: string, level?: string) => void;
}

interface SessionContext extends ToolContext {
  ui: UiHandle;
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
}

interface Pi {
  setLabel: (label: string) => void;
  on: (event: "session_start", handler: (event: unknown, ctx: SessionContext) => Promise<void> | void) => void;
  registerTool: (def: {
    name: string;
    label: string;
    description: string;
    parameters: unknown;
    execute: (
      id: string,
      params: unknown,
      signal: AbortSignal | undefined,
      onUpdate: ((update: unknown) => void) | undefined,
      ctx: ToolContext,
    ) => Promise<ToolResult>;
  }) => void;
  registerCommand: (
    name: string,
    def: {
      description: string;
      handler: (args: string, ctx: SessionContext) => Promise<void> | void;
    },
  ) => void;
}

type ArtifactFormat = "html" | "md" | "mdx";

/** Accept the "markdown" alias agents naturally type; anything else fails loud. */
function normalizeFormat(raw: string): ArtifactFormat {
  if (raw === "markdown") return "md";
  if (raw === "html" || raw === "md" || raw === "mdx") return raw;
  throw new Error(`Unknown artifact format "${raw}". Use html, md or mdx.`);
}

/** Docs entry filename per format (also the symlink the store leaves behind). */
function entryFile(format: ArtifactFormat): string {
  return format === "md" ? "index.md" : format === "mdx" ? "index.mdx" : "index.html";
}


const store = new LocalStore();

/**
 * artifacts:// protocol for reads via omp's read tool.
 * Forms: artifacts://<slug> (latest), artifacts://<slug>/<version> (e.g. /v002).
 * Read-only (immutable): writes go through the tools. If the internal
 * router doesn't exist in this omp version, the tools still work.
 */
const artifactsProtocolHandler = {
  scheme: "artifacts" as const,
  immutable: true as const,
  async resolve(url: { rawHost?: string; hostname?: string; pathname?: string; href: string }, context?: { cwd?: string }) {
    const cwd = context?.cwd ?? process.cwd();
    const slug = slugify(url.rawHost || url.hostname || "");
    if (!slug) throw new Error("artifacts:// URL requires a slug: artifacts://<slug>");
    const segments = (url.pathname || "").split("/").filter(Boolean);
    const version = segments.length === 1 && /^v\d+$/.test(segments[0]) ? segments[0] : undefined;
    if (segments.length > 1 || (segments.length === 1 && !version)) {
      throw new Error(`artifacts:// only supports <slug>[/<version>], got: ${url.href}`);
    }
    const found = version ? store.getVersion(cwd, slug, version) : store.get(cwd, slug);
    if (!found) throw new Error(`Unknown artifact: ${slug}${version ? `@${version}` : ""}`);
    return {
      url: url.href,
      content: found.content,
      contentType: found.format === "html" ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8",
      size: Buffer.byteLength(found.content, "utf-8"),
      sourcePath: `${store.dirFor(cwd).dir}/${found.slug}/${entryFile(found.format)}`,
      notes: [],
    };
  },
  async complete() {
    return [];
  },
};

async function tryRegisterArtifactsProtocol(): Promise<void> {
  try {
    const mod = await import("@oh-my-pi/pi-coding-agent/src/internal-urls/router");
    const router = mod.InternalUrlRouter.instance();
    router.register(artifactsProtocolHandler);
  } catch {
    return;
  }
}


export default function (pi: Pi) {
  pi.setLabel("Artifact CLI");
  void tryRegisterArtifactsProtocol();
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify(`artifacts ready in ${ctx.cwd}`, "info");
  });

  pi.registerTool({
    name: "artifact_create",
    label: "Artifact Create",
    description:
      "Save an artifact (standalone HTML, or Markdown/MDX with format=md|mdx) outside git and return path + version + shareable dashboard view link. For documents prefer md — choose mdx only when a visual genuinely adds information (real structure for a diagram, REAL data for a chart; never invent numbers, max one diagram per document). Call artifact_capabilities for components and props; props must be literals (inline your data). ALWAYS use this tool instead of writing docs/artifacts by hand. Share the view link with the user; never paste the content back.",
    parameters: z.object({
      slug: z.string().describe("kebab-case, e.g. auth-summary"),
      title: z.string().describe("Human-readable title"),
      content: z.string().describe("Complete source: standalone HTML, or Markdown/MDX when format is md/mdx"),
      format: z.enum(["html", "md", "markdown", "mdx"]).default("html").describe("storage format: html (default), md/markdown, mdx"),
      type: z.string().default("generic").optional().describe("generic|study|wireframe"),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const input = params as { slug: string; title: string; content: string; format?: string; type?: string };
      const slug = slugify(input.slug);
      const format = normalizeFormat(input.format ?? "html");
      const result = store.put(ctx.cwd, {
        slug,
        title: input.title,
        content: input.content,
        format,
        type: (input.type ?? "generic") as "generic" | "study" | "wireframe",
      });
      const view = viewLine(ctx.cwd, result.slug);
      const text = `OK ${result.slug}@${result.version} (${format})\nfile: ${result.filePath}\nrepo: ${result.repoId}\n${view ? `view: ${view}` : NO_DAEMON_HINT}`;
      return { content: [{ type: "text", text }], details: { ...result, format, view: view || undefined } };
    },
  });

  pi.registerTool({
    name: "artifact_read",
    label: "Artifact Read",
    description:
      "Read an artifact's source (HTML, Markdown or MDX) for editing (paging with offset/limit for large files). Use it before editing to work on top of latest. NEVER use it to show content to the user — to present an artifact, call artifact_show and reply with the dashboard link.",
    parameters: z.object({
      slug: z.string().describe("kebab-case, e.g. auth-summary"),
      version: z.string().optional().describe("e.g. v002. No version = latest"),
      offset: z.number().int().min(0).default(0).describe("start line (large files)"),
      limit: z.number().int().min(1).max(500).default(200).describe("max lines"),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { slug, version, offset, limit } = params as { slug: string; version?: string; offset: number; limit: number };
      const found = version ? store.getVersion(ctx.cwd, slugify(slug), version) : store.get(ctx.cwd, slugify(slug));
      if (!found) {
        const text = `NOT_FOUND ${slug}${version ? `@${version}` : ""}`;
        return { content: [{ type: "text", text }], details: { found: false } };
      }
      const lines = found.content.split("\n");
      const slice = lines.slice(offset, offset + limit).join("\n");
      const text = `${found.slug}@${found.version} (${found.title}, ${found.format}, sha ${found.sha})\nfile: ${store.dirFor(ctx.cwd).dir}/${found.slug}/${entryFile(found.format)}\n---\n${slice}`;
      return { content: [{ type: "text", text }], details: { ...found, totalLines: lines.length } };
    },
  });

  pi.registerTool({
    name: "artifact_update",
    label: "Artifact Update",
    description:
      "Edit an artifact by saving a new version (never rewrites). Pass baseVersion from artifact_read; if someone else touched it meanwhile, it reports a conflict instead of overwriting. Share the returned view link with the user; never paste the content back.",
    parameters: z.object({
      slug: z.string().describe("existing kebab-case"),
      content: z.string().describe("Updated complete source (HTML, Markdown or MDX matching the artifact's format)"),
      baseVersion: z.string().optional().describe("version seen in artifact_read, e.g. v002"),
      format: z.enum(["html", "md", "markdown", "mdx"]).optional().describe("switch storage format; omit to keep the current one"),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { slug, content, baseVersion, format } = params as { slug: string; content: string; baseVersion?: string; format?: string };
      const clean = slugify(slug);
      const current = store.get(ctx.cwd, clean);
      if (!current) {
        const text = `NOT_FOUND ${clean}. Use artifact_create for new slugs.`;
        return { content: [{ type: "text", text }], details: { updated: false } };
      }
      if (baseVersion && current.version !== baseVersion) {
        const text = `CONFLICT ${clean}: latest is ${current.version}, your base was ${baseVersion}. Read again with artifact_read and retry.`;
        return { content: [{ type: "text", text }], details: { updated: false, conflict: true, latest: current.version } };
      }
      const nextFormat = format ? normalizeFormat(format) : current.format;
      const result = store.put(ctx.cwd, { slug: clean, title: current.title, content, format: nextFormat, type: current.type });
      const view = viewLine(ctx.cwd, result.slug);
      const text = `OK ${result.slug}@${result.version}\nfile: ${result.filePath}\nrepo: ${result.repoId}\n${view ? `view: ${view}` : NO_DAEMON_HINT}`;
      return { content: [{ type: "text", text }], details: { ...result, view: view || undefined } };
    },
  });

  pi.registerTool({
    name: "artifact_versions",
    label: "Artifact Versions",
    description: "List an artifact's version history to pick a rollback (artifact_update with that version's html).",
    parameters: z.object({
      slug: z.string().describe("kebab-case"),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { slug } = params as { slug: string };
      const items = store.list(ctx.cwd);
      const entry = items.find((i) => i.slug === slugify(slug));
      if (!entry) {
        return { content: [{ type: "text", text: `NOT_FOUND ${slug}` }], details: { found: false } };
      }
      return { content: [{ type: "text", text: JSON.stringify(entry.versions, null, 2) }], details: { slug: entry.slug, latest: entry.latest, versions: entry.versions } };
    },
  });
  pi.registerTool({
    name: "artifact_list",
    label: "Artifact List",
    description: "List artifacts in the current repo (visible cross-worktree via stable repoId).",
    parameters: z.object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const items = store.list(ctx.cwd);
      return {
        content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
        details: { items },
      };
    },
  });

  pi.registerTool({
    name: "artifact_show",
    label: "Artifact Show",
    description:
      "Get the shareable dashboard link for an artifact (or the all-artifacts overview when no slug is given). ALWAYS use this when the user asks to see, show, open, or explain an artifact — reply with the link, never paste full HTML and never Read the file.",
    parameters: z.object({
      slug: z.string().optional().describe("kebab-case, e.g. auth-summary. Omit for the overview link."),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { slug } = params as { slug?: string };
      if (slug) {
        const clean = slugify(slug);
        if (!store.get(ctx.cwd, clean)) {
          const text = `NOT_FOUND ${clean}. Use artifact_list to see available slugs.`;
          return { content: [{ type: "text", text }], details: { found: false } };
        }
        const resolved = await resolveDashboard(ctx.cwd, clean);
        if (!resolved.ok) return { content: [{ type: "text", text: resolved.error }], details: { found: true, daemon: false } };
        const text = `OK ${clean}\nartifact: ${resolved.links.artifact}\nproject: ${resolved.links.project}\noverview: ${resolved.links.overview}`;
        return { content: [{ type: "text", text }], details: { found: true, slug: clean, ...resolved.links } };
      }
      const resolved = await resolveDashboard(ctx.cwd);
      if (!resolved.ok) return { content: [{ type: "text", text: resolved.error }], details: { daemon: false } };
      const text = `OK overview: ${resolved.links.overview}\nproject: ${resolved.links.project}`;
      return { content: [{ type: "text", text }], details: { ...resolved.links } };
    },
  });

  pi.registerTool({
    name: "artifact_capabilities",
    label: "Artifact Capabilities",
    description:
      "What the artifact dashboard can render BEFORE you generate one: supported formats (html|md|mdx), the built-in MDX components with props and examples (Chart, Stats, Stat, Callout, Section, Svg, Video, Audio), mermaid fence usage and viewer features. Call this before writing an mdx artifact; unknown components render as placeholders, and props must be literals (inline your data).",
    parameters: z.object({}),
    async execute(_id, _params, _signal, _onUpdate, _ctx) {
      const caps = getViewerCapabilities();
      const daemon = readDaemon();
      const guideUrl = daemon ? `http://${daemon.host}:${daemon.port}${caps.guidePath}` : null;
      const summary = [
        `formats: ${caps.formats.map((f) => f.format).join(" | ")}`,
        `components: ${caps.components.map((c) => `${c.name}(${c.props.map((p) => p.name).join(", ")})`).join(" · ")}`,
        `mermaid: fences tagged mermaid`,
        `guide: ${guideUrl ?? "start the daemon (artifact start) then open /mdx-guide"}`,
      ].join("\n");
      return {
        content: [{ type: "text", text: `OK\n${summary}\n\nFull details in the JSON payload.` }],
        details: { ...caps, guideUrl },
      };
    },
  });

  pi.registerTool({
    name: "artifact_asset",
    label: "Artifact Asset",
    description:
      "Attach a sibling file (png/svg/html/md/…) to an EXISTING artifact so its mdx can reference it by relative path: ![logo](logo.svg), <Webframe src=\"wireframe.html\" /> (browser-like embed), [notes](notes.md) (renders as a viewer sub-route). name is an artifact-relative subpath ('logo.svg', 'shots/01.png'); content goes base64-encoded. Bytes live in the versioned store; the dashboard serves them under /artifacts/<slug>/<name>. Create the artifact first with artifact_create.",
    parameters: z.object({
      slug: z.string().describe("existing kebab-case artifact slug"),
      name: z.string().describe("artifact-relative path, e.g. logo.svg or shots/01.png"),
      contentBase64: z.string().describe("file bytes, base64-encoded"),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { slug, name, contentBase64 } = params as { slug: string; name: string; contentBase64: string };
      const clean = slugify(slug);
      try {
        const result = store.putAsset(ctx.cwd, clean, name, Buffer.from(contentBase64, "base64"));
        const text = `OK ${clean}/${result.name}\nfile: ${result.filePath}\nrepo: ${result.repoId}\nreference it as: ${result.name}`;
        return { content: [{ type: "text", text }], details: result };
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text }], details: { ok: false } };
      }
    },
  });

  pi.registerCommand("artifact", {
    description: "Show artifact dashboard links: /artifact show [slug] · /artifact list",
    handler: async (args, ctx) => {
      const [sub, rest] = args.trim().split(/\s+/, 2);
      if (!sub || sub === "list") {
        const items = store.list(ctx.cwd);
        const daemon = readDaemon();
        const overview = daemon ? buildLinks(daemon.host, daemon.port, getProjectId(ctx.cwd)).overview : NO_DAEMON_HINT;
        const names = items.map((i) => `${i.slug}${i.format && i.format !== "html" ? `[${i.format}]` : ""}`).join(", ") || "(no artifacts yet)";
        ctx.ui.notify(`${items.length} artifact(s): ${names}\noverview: ${overview}`, "info");
        return;
      }
      if (sub === "show") {
        const slug = rest ? slugify(rest) : undefined;
        if (slug && !store.get(ctx.cwd, slug)) {
          ctx.ui.notify(`NOT_FOUND ${slug}`, "error");
          return;
        }
        const resolved = await resolveDashboard(ctx.cwd, slug);
        if (!resolved.ok) {
          ctx.ui.notify(resolved.error, "error");
          return;
        }
        ctx.ui.notify(slug ? resolved.links.artifact ?? resolved.links.project : resolved.links.overview, "info");
        return;
      }
      ctx.ui.notify("Usage: /artifact show [slug] · /artifact list", "error");
    },
  });
}

/** Exported only for protocol tests. */
export { artifactsProtocolHandler };
