import { createHash } from 'crypto';
import { realpathSync } from 'fs';
import path from 'path';

/** Canonical dir for identity: resolves symlinks (/tmp -> /private/tmp on
 * macOS), dot segments and trailing slashes so one directory is one project. */
export function canonicalDir(cwd: string): string {
  try {
    return realpathSync(cwd);
  } catch {
    return path.resolve(cwd);
  }
}

export function getProjectId(cwd: string): string {
  return createHash('sha256').update(canonicalDir(cwd)).digest('hex').slice(0, 16);
}

export function getProjectName(cwd: string): string {
  return path.basename(cwd);
}

export function getProjectArtifactsPath(cwd: string): string {
  return path.join(cwd, 'docs', 'artifacts');
}

export function getProjectStoragePath(projectId: string): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return path.join(homeDir, '.artifact', 'sessions', projectId);
}
