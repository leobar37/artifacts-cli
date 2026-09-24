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

export function createCommand(program: Command) {
  program
    .command('create')
    .description('Scaffold a new HTML artifact')
    .argument('<slug>', 'kebab-case id, e.g. auth-summary')
    .option('-t, --title <title>', 'Human-readable title (defaults to the slug)')
    .option('--type <type>', 'Artifact type: generic|study|wireframe (default generic)')
    .option('--force', 'Overwrite index.html if it already exists')
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

      const cwd = process.cwd();
      const title = options.title ?? humanizeSlug(slug);
      const dir = path.join(getProjectArtifactsPath(cwd), slug);
      const file = path.join(dir, 'index.html');

      if (existsSync(file) && !options.force) {
        log.error(`✗ ${path.relative(cwd, file)} already exists. Use --force to overwrite.`);
        process.exit(1);
      }

      mkdirSync(dir, { recursive: true });
      writeFileSync(file, buildHtmlTemplate(title, type as ArtifactKind));

      registerProject(cwd);
      await notifyDaemon(cwd);

      log.info(`✓ Created ${chalk.cyan(path.relative(cwd, file))}`);
      log.info(`  Preview it: ${chalk.cyan('artifact start')}`);
    });
}
