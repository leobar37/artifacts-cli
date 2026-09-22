import { z } from "zod";
import { LocalStore } from "@tarileo/artifact-store";
import type { ArtifactEntry } from "@tarileo/artifact-store";

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
      content: found.html,
      contentType: "text/html",
      size: Buffer.byteLength(found.html, "utf-8"),
      sourcePath: `${store.dirFor(cwd).dir}/${found.slug}/index.html`,
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


const createSchema = z.object({
  slug: z.string(),
  title: z.string(),
  html: z.string(),
  type: z.enum(["generic", "study", "wireframe"]).default("generic"),
});

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
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
      "Save HTML as a versioned artifact outside git and return path + version. ALWAYS use it instead of writing docs/artifacts by hand.",
    parameters: z.object({
      slug: z.string().describe("kebab-case, e.g. auth-summary"),
      title: z.string().describe("Human-readable title"),
      html: z.string().describe("Complete standalone HTML"),
      type: z.string().default("generic").optional().describe("generic|study|wireframe"),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const input = createSchema.parse(params);
      const slug = slugify(input.slug);
      const result = store.put(ctx.cwd, {
        slug,
        title: input.title,
        html: input.html,
        type: input.type,
      });
      const text = `OK ${result.slug}@${result.version}\nfile: ${result.filePath}\nrepo: ${result.repoId}`;
      return { content: [{ type: "text", text }], details: result };
    },
  });

  pi.registerTool({
    name: "artifact_read",
    label: "Artifact Read",
    description:
      "Read an artifact's current content (or a specific version). Use it before editing to work on top of latest.",
    parameters: z.object({
      slug: z.string().describe("kebab-case, e.g. auth-summary"),
      version: z.string().optional().describe("e.g. v002. No version = latest"),
      offset: z.number().int().min(0).default(0).describe("start line (large HTML files)"),
      limit: z.number().int().min(1).max(500).default(200).describe("max lines"),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { slug, version, offset, limit } = params as { slug: string; version?: string; offset: number; limit: number };
      const found = version ? store.getVersion(ctx.cwd, slugify(slug), version) : store.get(ctx.cwd, slugify(slug));
      if (!found) {
        const text = `NOT_FOUND ${slug}${version ? `@${version}` : ""}`;
        return { content: [{ type: "text", text }], details: { found: false } };
      }
      const lines = found.html.split("\n");
      const slice = lines.slice(offset, offset + limit).join("\n");
      const text = `${found.slug}@${found.version} (${found.title}, sha ${found.sha})\nfile: ${store.dirFor(ctx.cwd).dir}/${found.slug}/index.html\n---\n${slice}`;
      return { content: [{ type: "text", text }], details: { ...found, totalLines: lines.length } };
    },
  });

  pi.registerTool({
    name: "artifact_update",
    label: "Artifact Update",
    description:
      "Edit an artifact by saving a new version (never rewrites). Pass baseVersion from artifact_read; if someone else touched it meanwhile, it reports a conflict instead of overwriting.",
    parameters: z.object({
      slug: z.string().describe("existing kebab-case"),
      html: z.string().describe("Updated complete HTML"),
      baseVersion: z.string().optional().describe("version seen in artifact_read, e.g. v002"),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { slug, html, baseVersion } = params as { slug: string; html: string; baseVersion?: string };
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
      const result = store.put(ctx.cwd, { slug: clean, title: current.title, html, type: current.type });
      const text = `OK ${result.slug}@${result.version}\nfile: ${result.filePath}\nrepo: ${result.repoId}`;
      return { content: [{ type: "text", text }], details: result };
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

  pi.registerCommand("artifact", {
    description: "Create or list artifacts: /artifact list",
    handler: async (args, ctx) => {
      ctx.ui.notify(`artifact ${args.trim() || "list"}`, "info");
    },
  });
}

/** Exported only for protocol tests. */
export { artifactsProtocolHandler };
