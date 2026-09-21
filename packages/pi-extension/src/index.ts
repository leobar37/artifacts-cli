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
