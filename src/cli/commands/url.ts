import { Command } from 'commander';
import chalk from 'chalk';
import { getProjectId } from '../../utils/project.js';
import { getDaemon, getProject, isDaemonAlive } from '../../utils/projects.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cli:url');

export function urlCommand(program: Command) {
  program
    .command('url')
    .description('Print the dashboard link (all projects, or one project)')
    .argument('[projectId]', 'Project id (defaults to the all-artifacts overview)')
    .action(async (projectId?: string) => {
      const daemon = getDaemon();
      if (!daemon || !(await isDaemonAlive(daemon))) {
        log.warn(`No daemon running. Start with: artifact start`);
        process.exit(1);
      }

      const host = daemon.host ?? 'localhost';
      const base = `http://${host}:${daemon.port}`;

      if (!projectId) {
        // Default: the overview with every artifact of every project.
        // Resolve cwd for a friendlier message, but the link is global.
        const cwdId = getProjectId(process.cwd());
        const cwdProject = getProject(cwdId);
        log.info(chalk.cyan(`${base}/`));
        if (!cwdProject) {
          log.info(`Tip: ${chalk.cyan('artifact start')} registers this directory as well.`);
        }
        return;
      }

      const project = getProject(projectId);
      if (!project) {
        log.error(`✗ Unknown project "${projectId}". Pick one from: artifact list`);
        process.exit(1);
      }
      log.info(chalk.cyan(`${base}/p/${projectId}/`));
    });
}
