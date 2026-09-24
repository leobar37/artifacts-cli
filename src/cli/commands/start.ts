import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import {
  getDaemon,
  isDaemonAlive,
  migrateLegacyInstances,
  registerProject,
  removeDaemon,
  setDaemon,
} from '../../utils/projects.js';
import { findAvailablePort } from '../../utils/port-finder.js';
import { resolveHost } from '../../utils/host.js';
import { startServer, getActualPort } from '../../server/index.js';
import { isHeadless, openBrowser } from '../../utils/open-browser.js';
import { ensureBuild, runBuild } from '../../utils/build-check.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cli:start');

const here = fileURLToPath(import.meta.url);
const __dirname = path.dirname(here);
/** CLI entrypoint next to this command file (index.ts from src/, index.js from dist/). */
const CLI_ENTRY = path.resolve(__dirname, `../index${path.extname(here)}`);

async function waitForHealth(port: number, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

export function startCommand(program: Command) {
  program
    .command('start')
    .description('Ensure the daemon runs, register this project, open its dashboard')
    .option('-p, --port <port>', 'Port for the daemon (default 7000, auto-retry next 10)')
    .option('--host <host>', 'Host to advertise (IP/hostname, or "tailscale")')
    .option('--tailscale', 'Expose via Tailscale (shortcut for --host tailscale)')
    .option('--no-open', 'Do not open browser automatically')
    .option('--build', 'Force dashboard rebuild before starting')
    .option('--dev', 'Start in development mode with Vite HMR')
    .action(async (options) => {
      const cwd = process.cwd();

      const migrated = migrateLegacyInstances();
      for (const entry of migrated) {
        log.info(`Migrated legacy instance: ${entry.name} (${entry.projectPath})`);
      }

      const entry = registerProject(cwd);
      const requestedHost: string | undefined = options.tailscale ? 'tailscale' : (options.host ?? process.env.ARTIFACT_HOST);
      const { displayHost, bindHost, viaTailscale } = resolveHost(requestedHost);

      if (options.dev) {
        // Development mode: daemon in-process + Vite dev server
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

        await startServer({ port: apiPort, host: bindHost });
        const bound = getActualPort() || apiPort;
        setDaemon({
          port: bound,
          host: displayHost,
          pid: process.pid,
          startedAt: new Date().toISOString(),
        });

        log.info('Starting Vite dev server...');

        const viteProcess = spawn('bunx', ['vite', '--port', '5177'], {
          cwd: packageRoot,
          stdio: 'inherit',
          env: { ...process.env, ARTIFACT_API_PORT: String(bound) }
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
          removeDaemon();
          process.exit(0);
        };
        const dashboardUrl = `http://localhost:5177/p/${entry.projectId}/`;
        log.info(chalk.bold('Dev servers running:'));
        log.info(`  API:       ${chalk.cyan(`http://localhost:${bound}`)}`);
        log.info(`  Dashboard: ${chalk.cyan(dashboardUrl)}`);
        log.info('');

        if (options.open) {
          await openBrowser(dashboardUrl);
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

      // Reuse the running daemon when possible
      const existing = getDaemon();
      if (existing && await isDaemonAlive(existing)) {
        const host = existing.host ?? 'localhost';
        const url = `http://${host}:${existing.port}/p/${entry.projectId}/`;
        // The daemon reads the registry per request, but its file watcher only
        // learns new projects via POST: notify it (best-effort, file is already written).
        try {
          await fetch(`http://127.0.0.1:${existing.port}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: cwd }),
          });
        } catch {
          // daemon will pick it up on next restart
        }
        log.info(`Daemon already running at http://${host}:${existing.port}`);
        log.info(`Project ${chalk.bold(entry.name)}: ${chalk.cyan(url)}`);
        if (options.open) {
          await openBrowser(url);
        }
        return;
      }
      // Spawn the daemon detached
      const port = options.port ? parseInt(options.port, 10) : await findAvailablePort();
      const serveArgs = ['serve', '-p', String(port)];
      if (options.tailscale) {
        serveArgs.push('--tailscale');
      } else if (options.host) {
        serveArgs.push('--host', options.host);
      }

      log.info(`Starting daemon for ${entry.name} at http://${displayHost}:${port}...`);
      const child = spawn(process.execPath, [CLI_ENTRY, ...serveArgs], {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      });
      child.unref();

      if (!await waitForHealth(port)) {
        log.error(`Daemon did not become healthy on port ${port}. Check logs with: ${chalk.cyan('artifact list')}`);
        process.exit(1);
      }

      const url = `http://${displayHost}:${port}/p/${entry.projectId}/`;
      log.info(`✓ Daemon running${viaTailscale ? ' (tailscale)' : ''}. Project dashboard: ${chalk.cyan(url)}`);
      if (isHeadless()) {
        log.info(`Headless server — open manually: ${chalk.cyan(url)}`);
      }

      if (options.open) {
        await openBrowser(url);
      }
    });
}

