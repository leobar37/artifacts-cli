import { Command } from 'commander';
import { getDaemon, setDaemon, removeDaemon, isDaemonAlive } from '../../utils/projects.js';
import { resolveHost } from '../../utils/host.js';
import { startServer, getActualPort } from '../../server/index.js';
import { ensureBuild } from '../../utils/build-check.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cli:serve');

export function serveCommand(program: Command) {
  program
    .command('serve')
    .description('Run the artifact daemon (single server for all projects)')
    .option('-p, --port <port>', 'Port to listen on (default 7000, auto-retry next 10)')
    .option('--host <host>', 'Host to advertise (IP/hostname, or "tailscale")')
    .option('--tailscale', 'Expose via Tailscale (shortcut for --host tailscale)')
    .action(async (options) => {
      const requestedHost: string | undefined = options.tailscale ? 'tailscale' : (options.host ?? process.env.ARTIFACT_HOST);
      const { displayHost, bindHost, viaTailscale } = resolveHost(requestedHost);

      ensureBuild();

      const existing = getDaemon();
      if (existing && await isDaemonAlive(existing)) {
        const host = existing.host ?? 'localhost';
        log.info(`Daemon already running at http://${host}:${existing.port} (PID ${existing.pid})`);
        return;
      }
      if (existing) removeDaemon();

      const port = options.port ? parseInt(options.port, 10) : 7000;

      try {
        await startServer({ port, host: bindHost });
        const bound = getActualPort() || port;

        setDaemon({
          port: bound,
          host: displayHost,
          pid: process.pid,
          startedAt: new Date().toISOString(),
        });

        log.info(`✓ Daemon running at http://${displayHost}:${bound}${viaTailscale ? ' (tailscale)' : ''}`);

        const cleanup = () => {
          log.warn('\nShutting down daemon...');
          removeDaemon();
          process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
      } catch (error) {
        log.error('Failed to start daemon:', error);
        process.exit(1);
      }
    });
}
