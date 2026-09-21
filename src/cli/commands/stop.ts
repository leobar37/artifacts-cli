import { Command } from 'commander';
import chalk from 'chalk';
import { getProjectId, getProjectName } from '../../utils/project.js';
import { getInstance, removeInstance, getAllInstances } from '../../utils/lockfile.js';
import { isInstanceAlive } from '../../utils/instance-checker.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cli:stop');

function killProcess(pid: number): boolean {
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

export function stopCommand(program: Command) {
  program
    .command('stop')
    .description('Stop the artifact server for current project')
    .option('--all', 'Stop all running instances')
    .action(async (options) => {
      if (options.all) {
        const instances = getAllInstances();
        let stopped = 0;

        for (const instance of instances) {
          const isAlive = await isInstanceAlive(instance);
          if (isAlive) {
            log.warn(
              `Stopping ${getProjectName(instance.projectPath)} on port ${instance.port} (PID ${instance.pid})...`
            );
            if (killProcess(instance.pid)) {
              log.info(`  ✓ Killed PID ${instance.pid}`);
            }
            stopped++;
          }
          removeInstance(instance.projectId);
        }

        log.info(`✓ Removed ${stopped} instances from registry`);
        return;
      }

      const cwd = process.cwd();
      const projectId = getProjectId(cwd);
      const projectName = getProjectName(cwd);

      const instance = getInstance(projectId);
      if (!instance) {
        log.info(`No server registered for ${projectName}`);
        return;
      }

      const isAlive = await isInstanceAlive(instance);
      if (isAlive) {
        log.warn(`Stopping server for ${projectName} on port ${instance.port} (PID ${instance.pid})...`);
        if (killProcess(instance.pid)) {
          log.info(`  ✓ Killed PID ${instance.pid}`);
        }
      } else {
        log.info(`Server for ${projectName} was already stopped`);
      }

      removeInstance(projectId);
      log.info(`✓ Removed ${projectName} from registry`);
    });
}
