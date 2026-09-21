import { randomUUID } from 'crypto';
import type { ArtifactSession, SessionStoreOptions, SessionMetadata } from './types.js';
import type { SessionPersistence } from './persistence.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('session-store');

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class SessionStore {
  private sessions: Map<string, ArtifactSession> = new Map();
  private slugIndex: Map<string, string> = new Map();
  private ttlMs: number;
  private cleanupIntervalMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private persistence?: SessionPersistence;

  constructor(options: SessionStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
    this.persistence = options.persistence;
    this.startCleanupTimer();
  }

  async loadFromDisk(): Promise<number> {
    if (!this.persistence) return 0;

    try {
      const sessions = await this.persistence.loadAll();
      let loaded = 0;

      for (const session of sessions) {
        // Refresh system context from current artifact on load
        // This ensures context isn't stale if artifact changed while server was down
        this.sessions.set(session.id, session);
        this.slugIndex.set(session.slug, session.id);
        loaded++;
      }

      log.info(`Restored ${loaded} sessions from disk (${this.sessions.size} total active)`);
      return loaded;
    } catch (err) {
      log.warn('Failed to load sessions from disk:', err);
      return 0;
    }
  }

  private async saveToDisk(session: ArtifactSession): Promise<void> {
    if (!this.persistence) return;
    await this.persistence.save(session);
  }

  async create(slug: string, path: string, type: string, description: string, fullContent?: string): Promise<ArtifactSession> {
    const id = randomUUID();
    const now = Date.now();

    const systemContext = this.buildSystemContext(slug, path, type, description, fullContent);

    const session: ArtifactSession = {
      id,
      slug,
      path,
      type,
      description,
      systemContext,
      createdAt: now,
      lastActivity: now,
    };

    this.sessions.set(id, session);
    this.slugIndex.set(slug, id);

    // Persist to disk
    await this.saveToDisk(session);

    log.info(`Created session ${id} for artifact "${slug}" (${this.sessions.size} total active)`);
    return session;
  }

  get(id: string): ArtifactSession | null {
    const session = this.sessions.get(id);
    if (!session) {
      log.info(`Session ${id.slice(0, 8)}... not found in memory. Total active: ${this.sessions.size}`);
      return null;
    }

    session.lastActivity = Date.now();
    return session;
  }

  getMetadata(id: string): SessionMetadata | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    
    return {
      id: session.id,
      slug: session.slug,
      path: session.path,
      type: session.type,
      model: session.model,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
    };
  }

  async updateDescription(id: string, description: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) return false;

    session.description = description;
    session.systemContext = this.buildSystemContext(
      session.slug,
      session.path,
      session.type,
      description
    );
    session.lastActivity = Date.now();

    // Persist to disk
    await this.saveToDisk(session);

    return true;
  }

  async updateProviderSessionId(id: string, providerSessionId: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) return false;

    session.providerSessionId = providerSessionId;
    session.lastActivity = Date.now();

    // Persist to disk
    await this.saveToDisk(session);

    return true;
  }

  async updateMessages(id: string, messages: import('ai').UIMessage[]): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) return false;

    session.messages = messages;
    session.lastActivity = Date.now();

    // Persist to disk
    await this.saveToDisk(session);

    return true;
  }

  async updateModel(id: string, model: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) return false;

    session.model = model;
    session.lastActivity = Date.now();

    // Persist to disk
    await this.saveToDisk(session);

    log.info(`Updated model for session ${id.slice(0, 8)}... to ${model}`);
    return true;
  }

  async refreshSystemContext(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) return false;

    try {
      const { readFile } = await import('fs/promises');
      const content = await readFile(session.path, 'utf-8');
      session.systemContext = this.buildSystemContext(
        session.slug,
        session.path,
        session.type,
        session.description,
        content,
      );
      session.lastActivity = Date.now();
      await this.saveToDisk(session);
      log.info(`Refreshed system context for session ${id.slice(0, 8)}...`);
      return true;
    } catch (err) {
      log.warn(`Failed to refresh system context for session ${id.slice(0, 8)}...:`, err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  getBySlug(slug: string): ArtifactSession | null {
    const id = this.slugIndex.get(slug);
    if (!id) return null;
    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (session) {
      this.slugIndex.delete(session.slug);
    }
    const deleted = this.sessions.delete(id);
    if (deleted) {
      // Delete from disk
      if (this.persistence) {
        await this.persistence.delete(id);
      }
      log.info(`Deleted session ${id} (${this.sessions.size} remaining)`);
    }
    return deleted;
  }

  list(): SessionMetadata[] {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      slug: session.slug,
      path: session.path,
      type: session.type,
      model: session.model,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
    }));
  }

  listBySlug(slug: string): SessionMetadata[] {
    return Array.from(this.sessions.values())
      .filter((session) => session.slug === slug)
      .sort((a, b) => b.lastActivity - a.lastActivity) // Most recent first
      .map((session) => ({
        id: session.id,
        slug: session.slug,
        path: session.path,
        type: session.type,
        model: session.model,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
      }));
  }

  private buildSystemContext(slug: string, path: string, type: string, description: string, fullContent?: string): string {
    const contentSection = fullContent
      ? `\n<artifact-content>\n${fullContent}\n</artifact-content>`
      : `\nContent Summary: ${description || 'No description available'}`;

    return `You are an artifact editor agent. Be concise and action-oriented.

Artifact: ${slug}
File: ${path}
Type: ${type}
${contentSection}

Rules:
- For edit requests: use str_replace_editor or bash to modify the file at the path above. Reply with ONE short sentence saying what you changed.
- For questions: answer directly using the artifact content above.
- Never ask for permission. You have full write access to the file.
- The dashboard auto-refreshes when the file changes.`;
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > this.ttlMs) {
        expiredIds.push(id);
        this.slugIndex.delete(session.slug);
      }
    }

    for (const id of expiredIds) {
      this.sessions.delete(id);
    }

    if (expiredIds.length > 0) {
      log.info(`Cleaned up ${expiredIds.length} expired sessions`);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);
  }

  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
    this.slugIndex.clear();
  }
}

// Singleton instance - may be replaced by server-initialized store with persistence
let sessionStore = new SessionStore();

// Check if server has initialized a store with persistence
function getSessionStore(): SessionStore {
  const globalStore = (global as any).__SESSION_STORE__;
  if (globalStore && globalStore instanceof SessionStore) {
    return globalStore;
  }
  return sessionStore;
}

export { sessionStore, getSessionStore };
