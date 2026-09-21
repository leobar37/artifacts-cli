import { mkdir, readdir, readFile, writeFile, unlink, access } from 'fs/promises';
import { join } from 'path';
import type { ArtifactSession } from './types.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('persistence');

export interface SessionPersistence {
  loadAll(): Promise<ArtifactSession[]>;
  loadById(id: string): Promise<ArtifactSession | null>;
  save(session: ArtifactSession): Promise<void>;
  delete(id: string): Promise<void>;
  validateSessions(existingSlugs: string[]): Promise<string[]>;
  cleanupOrphaned(sessionIds: string[]): Promise<number>;
}

export interface FileSystemPersistenceOptions {
  storageDir: string;
}

export class FileSystemPersistence implements SessionPersistence {
  private storageDir: string;

  constructor(options: FileSystemPersistenceOptions) {
    this.storageDir = options.storageDir;
  }

  async loadAll(): Promise<ArtifactSession[]> {
    try {
      await this.ensureDirectory();
      const files = await readdir(this.storageDir);
      const sessionFiles = files.filter((f) => f.endsWith('.json'));

      const sessions: ArtifactSession[] = [];
      for (const file of sessionFiles) {
        try {
          const session = await this.loadFromFile(join(this.storageDir, file));
          if (session) {
            sessions.push(session);
          }
        } catch (err) {
          log.warn(`Failed to load session from ${file}:`, err);
        }
      }

      return sessions;
    } catch (err) {
      log.warn('Failed to load sessions:', err);
      return [];
    }
  }

  async loadById(id: string): Promise<ArtifactSession | null> {
    try {
      const filePath = this.getSessionPath(id);
      return await this.loadFromFile(filePath);
    } catch (err) {
      return null;
    }
  }

  async save(session: ArtifactSession): Promise<void> {
    try {
      await this.ensureDirectory();
      const filePath = this.getSessionPath(session.id);
      const data = JSON.stringify(session, null, 2);
      await writeFile(filePath, data, 'utf-8');
      log.info(`Saved session ${session.id} for "${session.slug}"`);
    } catch (err) {
      log.warn(`Failed to save session ${session.id}:`, err);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const filePath = this.getSessionPath(id);
      await unlink(filePath);
      log.info(`Deleted session file ${id}`);
    } catch (err) {
      // File may not exist, that's okay
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn(`Failed to delete session ${id}:`, err);
      }
    }
  }

  async validateSessions(existingSlugs: string[]): Promise<string[]> {
    const orphaned: string[] = [];
    try {
      const sessions = await this.loadAll();
      for (const session of sessions) {
        if (!existingSlugs.includes(session.slug)) {
          orphaned.push(session.id);
        }
      }
    } catch (err) {
      log.warn('Failed to validate sessions:', err);
    }
    return orphaned;
  }

  async cleanupOrphaned(sessionIds: string[]): Promise<number> {
    let cleaned = 0;
    for (const id of sessionIds) {
      try {
        await this.delete(id);
        cleaned++;
      } catch (err) {
        log.warn(`Failed to cleanup orphaned session ${id}:`, err);
      }
    }
    log.info(`Cleaned up ${cleaned} orphaned sessions`);
    return cleaned;
  }

  private async ensureDirectory(): Promise<void> {
    try {
      await access(this.storageDir);
    } catch {
      await mkdir(this.storageDir, { recursive: true, mode: 0o700 });
      log.info(`Created storage directory: ${this.storageDir}`);
    }
  }

  private getSessionPath(id: string): string {
    return join(this.storageDir, `${id}.json`);
  }

  private async loadFromFile(filePath: string): Promise<ArtifactSession | null> {
    try {
      const data = await readFile(filePath, 'utf-8');
      const session = JSON.parse(data) as ArtifactSession;
      return session;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }
}

export function getSessionStoragePath(projectId: string): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return join(homeDir, '.artifact', 'sessions', projectId);
}
