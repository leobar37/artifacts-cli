import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { getProjectArtifactsPath } from '../../utils/project.js';
import { notifyDaemon, registerProject } from '../../utils/projects.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cli:create');

const VALID_TYPES = ['generic', 'study', 'wireframe'] as const;
type ArtifactKind = (typeof VALID_TYPES)[number];

const VALID_FORMATS = ['html', 'md', 'mdx'] as const;
type ArtifactFormat = (typeof VALID_FORMATS)[number];

/** Slugs are kebab-case directory names. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

export function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

export function buildHtmlTemplate(title: string, type: ArtifactKind): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="artifact-type" content="${type}" />
  <title>${title}</title>
</head>
<body>
  <h1>${title}</h1>
</body>
</html>
`;
}

/** Markdown scaffold: frontmatter carries title/type, body starts the doc. */
export function buildMarkdownTemplate(title: string, type: ArtifactKind, format: 'md' | 'mdx'): string {
  const head = format === 'mdx' ? 'import { Chart } from "./components"\n\n' : '';
  return `---
title: ${title}
type: ${type}
---

${head}# ${title}

Write here. GFM tables, task lists and fenced code render in the dashboard viewer.
`;
}

export function createCommand(program: Command) {
  program
    .command('create')
    .description('Scaffold a new artifact (HTML by default, or Markdown/MDX with --format)')
    .argument('<slug>', 'kebab-case id, e.g. auth-summary')
    .option('-t, --title <title>', 'Human-readable title (defaults to the slug)')
    .option('--type <type>', 'Artifact type: generic|study|wireframe (default generic)')
    .option('--format <format>', 'Storage format: html|md|mdx (default html)')
    .option('--force', 'Overwrite the entry file if it already exists')
    .action(async (slug: string, options) => {
      if (!isValidSlug(slug)) {
        log.error(`✗ Invalid slug "${slug}". Use kebab-case: lowercase letters, numbers, hyphens.`);
        process.exit(1);
      }

      const type = (options.type ?? 'generic') as string;
      if (!(VALID_TYPES as readonly string[]).includes(type)) {
        log.error(`✗ Invalid type "${type}". Must be one of: ${VALID_TYPES.join(', ')}`);
        process.exit(1);
      }

      const format = (options.format ?? 'html') as ArtifactFormat;
      if (!(VALID_FORMATS as readonly string[]).includes(format)) {
        log.error(`✗ Invalid format "${format}". Must be one of: ${VALID_FORMATS.join(', ')}`);
        process.exit(1);
      }

      const cwd = process.cwd();
      const title = options.title ?? humanizeSlug(slug);
      const dir = path.join(getProjectArtifactsPath(cwd), slug);
      const file = path.join(dir, `index.${format}`);

      if (existsSync(file) && !options.force) {
        log.error(`✗ ${path.relative(cwd, file)} already exists. Use --force to overwrite.`);
        process.exit(1);
      }

      mkdirSync(dir, { recursive: true });
      const template =
        format === 'html'
          ? buildHtmlTemplate(title, type as ArtifactKind)
          : buildMarkdownTemplate(title, type as ArtifactKind, format);
      writeFileSync(file, template);

      registerProject(cwd);
      await notifyDaemon(cwd);

      log.info(`✓ Created ${chalk.cyan(path.relative(cwd, file))}`);
      log.info(`  Preview it: ${chalk.cyan('artifact start')}`);
    });
}
