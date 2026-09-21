import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import chalk from 'chalk';
import { createLogger } from './logger.js';

const log = createLogger('build-check');

// Get the directory where the CLI is installed
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dashboard is relative to the CLI installation (dist/dashboard from cli/index.js location)
const CLI_ROOT = path.resolve(__dirname, '../..');
const DASHBOARD_PATH = path.join(CLI_ROOT, 'dist', 'dashboard', 'index.html');

export function getDashboardPath(): string {
  return path.join(CLI_ROOT, 'dist', 'dashboard');
}

export function isBuildRequired(): boolean {
  return !existsSync(DASHBOARD_PATH);
}

export function runBuild(): void {
  log.info('📦 Building dashboard and server...');

  try {
    execSync('pnpm run build', {
      cwd: CLI_ROOT,
      stdio: 'inherit',
    });

    log.info('✓ Build completed');
  } catch (error) {
    log.error('✗ Build failed');
    throw error;
  }
}

export function ensureBuild(): void {
  if (!existsSync(DASHBOARD_PATH)) {
    log.warn('⚠️  Dashboard not found. Building...');
    runBuild();
  }
}
