import { Command } from 'commander';
import { existsSync, readFileSync, statSync, watch } from 'fs';
import { daemonLogPath } from '../../utils/daemon-log.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cli:logs');

function tailLines(file: string, n: number): string[] {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.slice(Math.max(0, lines.length - n));
}

export function logsCommand(program: Command) {
  program
    .command('logs')
    .description('Show the daemon log')
    .option('-n, --tail <lines>', 'Number of lines to show (default 100)', '100')
    .option('-f, --follow', 'Keep printing new lines until interrupted')
    .action(async (options) => {
      const file = daemonLogPath();
      if (!existsSync(file)) {
        log.info('No daemon log yet. Start the daemon with: artifact start');
        return;
      }

      const tail = Math.max(1, parseInt(options.tail, 10) || 100);
      for (const line of tailLines(file, tail)) {
        console.log(line);
      }

      if (!options.follow) return;

      let offset = statSync(file).size;
      const watcher = watch(file, () => {
        try {
          const size = statSync(file).size;
          if (size < offset) {
            offset = 0; // rotated
          }
          if (size > offset) {
            const fd = readFileSync(file, 'utf-8').slice(offset);
            offset = size;
            process.stdout.write(fd);
          }
        } catch {
          // file vanished mid-follow; stop quietly
          watcher.close();
        }
      });

      process.on('SIGINT', () => {
        watcher.close();
        process.exit(0);
      });
      await new Promise(() => {});
    });
}
