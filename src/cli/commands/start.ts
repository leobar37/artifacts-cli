import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { getProjectId, getProjectName } from '../../utils/project.js';
import { getInstance, setInstance, removeInstance } from '../../utils/lockfile.js';
import { isInstanceAlive } from '../../utils/instance-checker.js';
import { findAvailablePort } from '../../utils/port-finder.js';
import { resolveHost } from '../../utils/host.js';
import { startServer } from '../../server/index.js';
import { isHeadless, openBrowser } from '../../utils/open-browser.js';
import { ensureBuild, runBuild } from '../../utils/build-check.js';
import { createLogger } from '../../utils/logger.js';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const log = createLogger('cli:start');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startCommand(program: Command) {
  program
    .command('start')
    .description('Start the artifact server for current project')
    .option('-p, --port <port>', 'Specific port to use')
    .option('--host <host>', 'Host to advertise (IP/hostname, or "tailscale")')
    .option('--tailscale', 'Expose via Tailscale (shortcut for --host tailscale)')
    .option('--no-open', 'Do not open browser automatically')
    .option('--build', 'Force rebuild before starting')
    .option('--dev', 'Start in development mode with Vite HMR')
    .action(async (options) => {
      const cwd = process.cwd();
      const projectId = getProjectId(cwd);
      const projectName = getProjectName(cwd);
      const artifactsPath = path.join(cwd, 'docs', 'artifacts');
      const requestedHost: string | undefined = options.tailscale ? 'tailscale' : (options.host ?? process.env.ARTIFACT_HOST);
      const { displayHost, bindHost, viaTailscale } = resolveHost(requestedHost);

      if (options.dev) {
        // Development mode: start backend + Vite dev server
        const apiPort = options.port ? parseInt(options.port, 10) : 7000;
        const packageRoot = path.resolve(__dirname, '../../..');
        const viteConfigPath = path.join(packageRoot, 'vite.config.ts');

        if (!fs.existsSync(viteConfigPath)) {
          log.error('Dev mode requires the artifact-cli source code with Vite installed.');
          log.info('Please run from the artifact-cli directory:');
          log.info(chalk.cyan('  bun run dev'));
          log.info('Or install artifact-cli from source:');
          log.info(chalk.cyan('  cd /path/to/artifact-cli && bun install'));
        }

        // Check existing instance
        const existing = getInstance(projectId);
        if (existing && await isInstanceAlive(existing)) {
          const existingHost = existing.host ?? 'localhost';
          log.info(`Server already running for ${projectName} at http://${existingHost}:${existing.port}`);
        } else {
          // Clean up stale lock if exists
          if (existing) {
            removeInstance(projectId);
          }

          log.info(`Starting API server for ${projectName} on port ${apiPort}...`);
          await startServer({ port: apiPort, projectPath: cwd, artifactsPath, host: bindHost });

          setInstance({
            projectPath: cwd,
            projectId,
            port: apiPort,
            host: displayHost,
            pid: process.pid,
            startedAt: new Date().toISOString(),
          });

          log.info(`✓ API server running at http://${displayHost}:${apiPort}${viaTailscale ? ' (tailscale)' : ''}`);
        }

        // Start Vite dev server
        log.info('Starting Vite dev server...');

        const viteProcess = spawn('bunx', ['vite', '--port', '5177'], {
          cwd: packageRoot,
          stdio: 'inherit',
          env: { ...process.env, ARTIFACT_API_PORT: String(apiPort) }
        });

        let viteStarted = false;

        viteProcess.on('spawn', () => {
          viteStarted = true;
        });

        viteProcess.on('exit', (code) => {
          if (code !== 0 && viteStarted) {
            log.error(`Vite dev server exited with code ${code}`);
          }
        });

        // Handle graceful shutdown
        const cleanup = () => {
          log.warn('\nShutting down servers...');
          if (!viteProcess.killed) {
            viteProcess.kill();
          }
          removeInstance(projectId);
          process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

        log.info('');
        log.info(chalk.bold('Dev servers running:'));
        log.info(`  API:       ${chalk.cyan(`http://localhost:${apiPort}`)}`);
        log.info(`  Dashboard: ${chalk.cyan('http://localhost:5177')}`);
        log.info('');

        if (options.open) {
          await openBrowser('http://localhost:5177');
        }

        // Keep process alive
        await new Promise(() => {});
        return;
      }

      // Production mode (default)
      if (options.build) {
        runBuild();
      } else {
        ensureBuild();
      }

      // Check existing instance
      const existing = getInstance(projectId);
      if (existing && await isInstanceAlive(existing)) {
        const existingHost = existing.host ?? 'localhost';
        log.info(`Server already running for ${projectName} at http://${existingHost}:${existing.port}`);
        if (options.open) {
          await openBrowser(`http://${existingHost}:${existing.port}`);
        }
        process.exit(0);
      }

      // Clean up stale lock if exists
      if (existing) {
        removeInstance(projectId);
      }

      // Find port
      const port = options.port ? parseInt(options.port, 10) : await findAvailablePort();

      // Start server
      log.info(`Starting server for ${projectName} at http://${displayHost}:${port}...`);

      try {
        await startServer({ port, projectPath: cwd, artifactsPath, host: bindHost });

        // Save instance
        setInstance({
          projectPath: cwd,
          projectId,
          port,
          host: displayHost,
          pid: process.pid,
          startedAt: new Date().toISOString(),
        });

        log.info(`✓ Server running at http://${displayHost}:${port}${viaTailscale ? ' (tailscale)' : ''}`);
        if (isHeadless()) {
          log.info(`Headless server — open manually: http://${displayHost}:${port}`);
        }

        if (options.open) {
          await openBrowser(`http://${displayHost}:${port}`);
        }

        // Handle graceful shutdown
        const cleanup = () => {
          log.warn('\nShutting down server...');
          removeInstance(projectId);
          process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
      } catch (error) {
        log.error('Failed to start server:', error);
        process.exit(1);
      }
    });
}
