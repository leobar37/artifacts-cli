import { Command } from 'commander';
import chalk from 'chalk';
import { getInstance } from '../../utils/lockfile.js';
import { getProjectId, getProjectName } from '../../utils/project.js';
import { isInstanceAlive } from '../../utils/instance-checker.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cli:reload');

export function reloadCommand(program: Command) {
  program
    .command('reload')
    .description('Trigger reload for an artifact in the running server')
    .argument('<slug>', 'Artifact slug to reload')
    .action(async (slug: string) => {
      const cwd = process.cwd();
      const projectId = getProjectId(cwd);
      const projectName = getProjectName(cwd);

      // Check if server is running
      const instance = getInstance(projectId);
      if (!instance || !(await isInstanceAlive(instance))) {
        log.warn(`No server running for ${projectName}. Start with: artifact start`);
        process.exit(1);
      }

      try {
        const response = await fetch(`http://localhost:${instance.port}/api/artifacts/${slug}/reload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          if (response.status === 404) {
            log.error(`✗ Artifact "${slug}" not found`);
          } else {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            log.error(`✗ Failed to reload: ${error.error || response.statusText}`);
          }
          process.exit(1);
        }

        const result = await response.json();
        log.info(`✓ ${result.message}`);
        log.info(`  Dashboard will reload the artifact`);
      } catch (error) {
        log.error('✗ Failed to connect to server');
        log.info(`  Server running on port ${instance.port}`);
        process.exit(1);
      }
    });
}
