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
 * Protocolo artifacts:// para lecturas via el read tool de omp.
 * Formas: artifacts://<slug> (latest), artifacts://<slug>/<version> (ej. /v002).
 * Solo lectura (immutable): la escritura va por los tools. Si el router
 * interno no existe en esta version de omp, los tools siguen funcionando.
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
    ctx.ui.notify(`artifacts listos en ${ctx.cwd}`, "info");
  });

  pi.registerTool({
    name: "artifact_create",
    label: "Artifact Create",
    description:
      "Guarda HTML como artifact versionado fuera de git y devuelve ruta + versión. Úsalo SIEMPRE en vez de escribir docs/artifacts a mano.",
    parameters: z.object({
      slug: z.string().describe("kebab-case, ej. resumen-auth"),
      title: z.string().describe("Título humano"),
      html: z.string().describe("HTML completo standalone"),
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
      "Lee el contenido actual de un artifact (o una versión concreta). Úsalo antes de editar para trabajar sobre el latest.",
    parameters: z.object({
      slug: z.string().describe("kebab-case, ej. resumen-auth"),
      version: z.string().optional().describe("ej. v002. Sin version = latest"),
      offset: z.number().int().min(0).default(0).describe("línea inicial (HTMLs grandes)"),
      limit: z.number().int().min(1).max(500).default(200).describe("máximo de líneas"),
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
      "Edita un artifact guardando una versión nueva (nunca reescribe). Pasa baseVersion del artifact_read; si otro lo tocó en medio, avisa conflicto en vez de pisar.",
    parameters: z.object({
      slug: z.string().describe("kebab-case existente"),
      html: z.string().describe("HTML completo actualizado"),
      baseVersion: z.string().optional().describe("versión vista en artifact_read, ej. v002"),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { slug, html, baseVersion } = params as { slug: string; html: string; baseVersion?: string };
      const clean = slugify(slug);
      const current = store.get(ctx.cwd, clean);
      if (!current) {
        const text = `NOT_FOUND ${clean}. Usa artifact_create para slugs nuevos.`;
        return { content: [{ type: "text", text }], details: { updated: false } };
      }
      if (baseVersion && current.version !== baseVersion) {
        const text = `CONFLICT ${clean}: latest es ${current.version}, tu base era ${baseVersion}. Lee de nuevo con artifact_read y reintenta.`;
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
    description: "Lista el historial de versiones de un artifact para elegir rollback (artifact_update con el html de esa versión).",
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
    description: "Lista artifacts del repo actual (visible cross-worktree por repoId estable).",
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
    description: "Crear o listar artifacts: /artifact list",
    handler: async (args, ctx) => {
      ctx.ui.notify(`artifact ${args.trim() || "list"}`, "info");
    },
  });
}

/** Exportado solo para tests del protocolo. */
export { artifactsProtocolHandler };
