import { Command } from 'commander';
import { getDaemon, isDaemonAlive, removeDaemon } from '../../utils/projects.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cli:stop');

export function stopCommand(program: Command) {
  program
    .command('stop')
    .description('Stop the artifact daemon')
    .action(async () => {
      const daemon = getDaemon();
      if (!daemon) {
        log.info('No daemon registered');
        return;
      }

      const alive = await isDaemonAlive(daemon);
      if (alive) {
        try {
          process.kill(daemon.pid, 'SIGTERM');
          log.info(`✓ Stopped daemon on port ${daemon.port} (PID ${daemon.pid})`);
        } catch {
          log.warn(`Could not signal PID ${daemon.pid}; removing lock`);
        }
      } else {
        log.info('Daemon was already stopped');
      }

      removeDaemon();
    });
}
