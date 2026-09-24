import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { getProjectName } from '../../utils/project.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cli:init');

const GITIGNORE_ENTRY = 'docs/artifacts/';

export function initCommand(program: Command) {
  program
    .command('init')
    .description('Initialize docs/artifacts for the current project')
    .action(async () => {
      const cwd = process.cwd();
      const projectName = getProjectName(cwd);
      const artifactsPath = path.join(cwd, 'docs', 'artifacts');

      if (!existsSync(artifactsPath)) {
        mkdirSync(artifactsPath, { recursive: true });
        log.info(`✓ Created docs/artifacts/`);
      } else {
        log.info(`docs/artifacts/ already exists`);
      }

      const gitignorePath = path.join(cwd, '.gitignore');
      const current = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
      const covered = current
        .split('\n')
        .some((line) => {
          const trimmed = line.trim();
          return trimmed === GITIGNORE_ENTRY || trimmed === 'docs/artifacts';
        });

      if (!covered) {
        const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
        writeFileSync(gitignorePath, `${current}${prefix}${GITIGNORE_ENTRY}\n`);
        log.info(`✓ Added ${GITIGNORE_ENTRY} to .gitignore (working copy; the store is the source of truth)`);
      } else {
        log.info(`.gitignore already covers docs/artifacts/`);
      }

      log.info('');
      log.info(`Project ${chalk.bold(projectName)} ready. Next steps:`);
      log.info(`  1. Create an artifact: docs/artifacts/<slug>/index.html,`);
      log.info(`     or from your agent with the artifact_create tool (omp extension).`);
      log.info(`  2. Preview it: ${chalk.cyan('artifact start')}`);
    });
}
