import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { LocalStore } from "@tarileo/artifact-store";
import { getProjectArtifactsPath } from "../../utils/project.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("cli:read");

const ENTRY_FILES = ["index.mdx", "index.md", "index.html"] as const;

function readFilesystemFallback(cwd: string, slug: string): { format: string; file: string; content: string } | null {
  for (const entry of ENTRY_FILES) {
    const file = path.join(getProjectArtifactsPath(cwd), slug, entry);
    if (existsSync(file)) {
      const format = entry.endsWith(".mdx") ? "mdx" : entry.endsWith(".md") ? "md" : "html";
      return { format, file, content: readFileSync(file, "utf-8") };
    }
  }
  return null;
}

export function readCommand(program: Command) {
  program
    .command("read")
    .description("Print an artifact's source (any format: mdx|md|html). Resolves the versioned store first, then docs/artifacts.")
    .argument("<slug>", "kebab-case id, e.g. avileo-crm-rubro")
    .option("--json", "Print metadata + content as JSON (for agents)")
    .option("--raw", "Print only the file content (no metadata header)")
    .option("--offset <n>", "Start line (0-based)", "0")
    .option("--limit <n>", "Max lines", "500")
    .action(async (slug: string, options) => {
      const cwd = process.cwd();
      const store = new LocalStore();
      const offset = Math.max(0, parseInt(options.offset ?? "0", 10) || 0);
      const limit = Math.min(2000, Math.max(1, parseInt(options.limit ?? "500", 10) || 500));

      const stored = store.get(cwd, slug);
      if (stored) {
        const lines = stored.content.split("\n");
        const slice = lines.slice(offset, offset + limit).join("\n");
        if (options.json) {
          console.log(JSON.stringify({
            slug: stored.slug, title: stored.title, format: stored.format,
            version: stored.version, sha: stored.sha, totalLines: lines.length,
            source: "store", content: slice,
          }, null, 2));
        } else if (options.raw) {
          process.stdout.write(slice + (slice.endsWith("\n") ? "" : "\n"));
        } else {
          log.info(chalk.bold(`${stored.slug}@${stored.version} (${stored.title}, ${stored.format})`));
          process.stdout.write(slice + (slice.endsWith("\n") ? "" : "\n"));
        }
        return;
      }

      const found = readFilesystemFallback(cwd, slug);
      if (!found) {
        log.error(`✗ Unknown artifact "${slug}". Try: ${chalk.cyan("artifact list")} or check docs/artifacts/`);
        process.exit(1);
      }
      const lines = found.content.split("\n");
      const slice = lines.slice(offset, offset + limit).join("\n");
      if (options.json) {
        console.log(JSON.stringify({
          slug, title: slug, format: found.format, version: null,
          totalLines: lines.length, source: "filesystem", file: found.file, content: slice,
        }, null, 2));
      } else if (options.raw) {
        process.stdout.write(slice + (slice.endsWith("\n") ? "" : "\n"));
      } else {
        log.info(chalk.dim(`(filesystem fallback: ${path.relative(cwd, found.file)}, ${found.format})`));
        process.stdout.write(slice + (slice.endsWith("\n") ? "" : "\n"));
      }
    });
}
