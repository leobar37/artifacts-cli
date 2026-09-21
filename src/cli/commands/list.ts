import { Command } from 'commander';
import chalk from 'chalk';
import { getAllInstances } from '../../utils/lockfile.js';
import { isInstanceAlive } from '../../utils/instance-checker.js';
import { getProjectName } from '../../utils/project.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cli:list');

export function listCommand(program: Command) {
  program
    .command('list')
    .description('List all artifact server instances')
    .action(async () => {
      const instances = getAllInstances();

      if (instances.length === 0) {
        log.info(chalk.gray('No instances found'));
        return;
      }

      log.info(chalk.bold('\nArtifact Server Instances\n'));
      log.info(
        chalk.dim(
          `${'Project'.padEnd(20)} ${'Port'.padEnd(8)} ${'Status'.padEnd(12)} URL\n`
        )
      );

      for (const instance of instances) {
        const projectName = getProjectName(instance.projectPath);
        const isAlive = await isInstanceAlive(instance);
        const status = isAlive
          ? chalk.green('running')
          : chalk.red('stopped');
        const host = instance.host ?? 'localhost';
        const url = isAlive
          ? chalk.blue(`http://${host}:${instance.port}`)
          : chalk.gray('-');

        log.info(
          `${projectName.padEnd(20)} ${String(instance.port).padEnd(8)} ${status.padEnd(12)} ${url}`
        );
      }

      log.info('');
    });
}
