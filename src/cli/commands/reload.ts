import { Command } from 'commander';
import { getProjectId } from '../../utils/project.js';
import { getDaemon, getProject, isDaemonAlive } from '../../utils/projects.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cli:reload');

export function reloadCommand(program: Command) {
  program
    .command('reload')
    .description('Trigger reload for an artifact in the running daemon')
    .argument('<slug>', 'Artifact slug to reload')
    .action(async (slug: string) => {
      const cwd = process.cwd();
      const projectId = getProjectId(cwd);
      const project = getProject(projectId);
      if (!project) {
        log.warn(`Project not registered. Start with: artifact start`);
        process.exit(1);
      }

      const daemon = getDaemon();
      if (!daemon || !(await isDaemonAlive(daemon))) {
        log.warn(`No daemon running. Start with: artifact start`);
        process.exit(1);
      }

      try {
        const response = await fetch(`http://127.0.0.1:${daemon.port}/p/${projectId}/api/artifacts/${slug}/reload`, {
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
        log.error('✗ Failed to connect to daemon');
        log.info(`  Daemon running on port ${daemon.port}`);
        process.exit(1);
      }
    });
}
