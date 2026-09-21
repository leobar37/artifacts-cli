import { createHash } from 'crypto';
import path from 'path';

export function getProjectId(cwd: string): string {
  return createHash('sha256').update(cwd).digest('hex').slice(0, 16);
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
