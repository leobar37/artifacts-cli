import { Command } from 'commander';
import chalk from 'chalk';
import { getDaemon, isDaemonAlive } from '../../utils/projects.js';
import { openBrowser } from '../../utils/open-browser.js';
import { createLogger } from '../../utils/logger.js';
import {
  formatCapabilitiesText,
  getViewerCapabilities,
  type ViewerCapabilities,
} from '../../utils/capabilities.js';

const log = createLogger('cli:capabilities');

export function guideUrlFromDaemon(
  daemon: { host: string; port: number } | null,
): string | null {
  if (!daemon) return null;
  const host = daemon.host ?? 'localhost';
  return `http://${host}:${daemon.port}/mdx-guide`;
}

export function capabilitiesCommand(program: Command) {
  program
    .command('capabilities')
    .description('What the artifact viewer supports: formats, MDX components, mermaid, features')
    .option('--json', 'Machine-readable output (for agents and scripts)')
    .action(async (options: { json?: boolean }) => {
      const caps = getViewerCapabilities();
      const daemon = getDaemon();
      const alive = daemon ? await isDaemonAlive(daemon) : false;
      const guideUrl = alive ? guideUrlFromDaemon(daemon) : null;

      if (options.json) {
        const payload: ViewerCapabilities & { guideUrl: string | null } = {
          ...caps,
          guideUrl,
        };
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      console.log(formatCapabilitiesText(caps, guideUrl));
    });
}

export function guideCommand(program: Command) {
  program
    .command('guide')
    .description('Open the live MDX guide (formats, components, mermaid) in your browser')
    .action(async () => {
      const daemon = getDaemon();
      if (!daemon || !(await isDaemonAlive(daemon))) {
        log.warn(`No daemon running. Start with: ${chalk.cyan('artifact start')}`);
        process.exit(1);
      }
      const url = guideUrlFromDaemon(daemon);
      if (!url) {
        log.error('✗ Could not resolve the daemon URL.');
        process.exit(1);
      }
      log.info(chalk.cyan(url));
      await openBrowser(url);
    });
}
