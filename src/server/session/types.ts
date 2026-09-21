import type { UIMessage } from 'ai';

export interface ArtifactSession {
  id: string;
  slug: string;
  path: string;
  type: string;
  description: string;
  systemContext: string;
  providerSessionId?: string;
  messages?: UIMessage[];
  model?: string;
  createdAt: number;
  lastActivity: number;
}

export interface SessionStoreOptions {
  ttlMs?: number;
  cleanupIntervalMs?: number;
  persistence?: import('./persistence.js').SessionPersistence;
}

export interface SessionMetadata {
  id: string;
  slug: string;
  path: string;
  type: string;
  model?: string;
  createdAt: number;
  lastActivity: number;
}

export { SessionPersistence, FileSystemPersistence, getSessionStoragePath } from './persistence.js';
