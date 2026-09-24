import { Command } from 'commander';
import chalk from 'chalk';
import { getDaemon, isDaemonAlive, listProjects, removeDaemon } from '../../utils/projects.js';
import { getProjectArtifactsPath } from '../../utils/project.js';
import { scanArtifacts } from '../../utils/scanner.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cli:list');

function artifactCount(projectPath: string): number {
  try {
    return scanArtifacts(getProjectArtifactsPath(projectPath)).totalCount;
  } catch {
    return 0;
  }
}

export function listCommand(program: Command) {
  program
    .command('list')
    .description('Show daemon status and registered projects')
    .action(async () => {
      const daemon = getDaemon();
      const alive = daemon ? await isDaemonAlive(daemon) : false;

      if (daemon && alive) {
        const host = daemon.host ?? 'localhost';
        log.info(`Daemon: ${chalk.green('running')} at ${chalk.cyan(`http://${host}:${daemon.port}`)} (PID ${daemon.pid})`);
      } else {
        if (daemon) removeDaemon();
        log.info(`Daemon: ${chalk.red('stopped')} (start with ${chalk.cyan('artifact start')})`);
      }

      const projects = listProjects();
      if (projects.length === 0) {
        log.info(chalk.gray('No projects registered'));
        return;
      }

      log.info(chalk.bold('\nProjects\n'));
      log.info(
        chalk.dim(
          `${'Project'.padEnd(20)} ${'Artifacts'.padEnd(10)} URL\n`
        )
      );

      for (const project of projects) {
        const count = artifactCount(project.projectPath);
        const url = alive && daemon
          ? chalk.blue(`http://${daemon.host ?? 'localhost'}:${daemon.port}/p/${project.projectId}/`)
          : chalk.gray('-');
        log.info(
          `${project.name.padEnd(20)} ${String(count).padEnd(10)} ${url}`
        );
        log.info(chalk.dim(`  ${project.projectPath}`));
      }

      log.info('');
    });
}
