import { Command } from 'commander';
import { getProjectId, getProjectName } from '../../utils/project.js';
import { getDaemon, getProject, isDaemonAlive, unregisterProject } from '../../utils/projects.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cli:unregister');

export function unregisterCommand(program: Command) {
  program
    .command('unregister')
    .description('Remove a project from the daemon registry')
    .argument('[projectId]', 'Project id (defaults to the current directory)')
    .action(async (projectId?: string) => {
      const cwd = process.cwd();
      const id = projectId ?? getProjectId(cwd);
      const project = getProject(id);
      if (!project) {
        log.info(`Project not registered${projectId ? `: ${projectId}` : ` (${getProjectName(cwd)})`}`);
        return;
      }

      // Ask the daemon to drop its watcher first (best-effort).
      const daemon = getDaemon();
      if (daemon && await isDaemonAlive(daemon)) {
        try {
          await fetch(`http://127.0.0.1:${daemon.port}/api/projects/${id}`, { method: 'DELETE' });
        } catch {
          unregisterProject(id);
        }
      } else {
        unregisterProject(id);
      }

      log.info(`✓ Unregistered ${project.name} (${project.projectPath})`);
    });
}
