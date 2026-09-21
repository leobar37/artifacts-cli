import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ArtifactHandler, ArtifactType } from './interface.js';
import { createLogger } from '../utils/logger.js';

const HANDLERS_DIR = dirname(fileURLToPath(import.meta.url));
const INTERNAL_FILES = new Set([
  'interface.ts', 'interface.js',
  'registry.ts', 'registry.js',
  'loader.ts', 'loader.js',
]);

const log = createLogger('handlers');

class HandlerRegistry {
  private handlers = new Map<ArtifactType, ArtifactHandler>();
  private defaultHandler: ArtifactHandler | null = null;
  private loaded = false;

  async loadAll(): Promise<void> {
    if (this.loaded) return;

    let files: string[];
    try {
      files = readdirSync(HANDLERS_DIR).filter(f =>
        (f.endsWith('.ts') || f.endsWith('.js')) &&
        !f.endsWith('.d.ts') &&
        !INTERNAL_FILES.has(f)
      );
    } catch {
      log.warn('Could not read handlers directory');
      files = [];
    }

    for (const file of files) {
      try {
        const mod = await import(join(HANDLERS_DIR, file));
        const modAny = mod as Record<string, unknown>;

        // Find the handler - check common export names
        const candidateNames = ['genericHandler', 'studyHandler', 'wireframeHandler', 'default'];
        let handler: ArtifactHandler | undefined;

        for (const name of candidateNames) {
          const candidate = modAny[name];
          if (
            typeof candidate === 'object' &&
            candidate !== null &&
            'type' in candidate &&
            'list' in candidate &&
            'get' in candidate &&
            'renderHints' in candidate
          ) {
            handler = candidate as ArtifactHandler;
            break;
          }
        }

        if (!handler) {
          log.warn(`Skipping ${file}: could not find handler export`);
          continue;
        }

        if (!['generic', 'study', 'wireframe'].includes(handler.type as string)) {
          log.warn(`Skipping ${file}: unknown type "${handler.type}"`);
          continue;
        }

        const type = handler.type as ArtifactType;
        this.handlers.set(type, handler);
        if (type === 'generic') {
          this.defaultHandler = handler;
        }
      } catch (err) {
        log.warn(`Failed to load ${file}:`, err instanceof Error ? err.message : String(err));
      }
    }

    // Fallback: if no generic handler was loaded, use the first available handler
    if (!this.defaultHandler && this.handlers.size > 0) {
      this.defaultHandler = this.handlers.values().next().value!;
    }

    this.loaded = true;
  }

  get(type: ArtifactType): ArtifactHandler | null {
    return this.handlers.get(type) ?? null;
  }

  getDefault(): ArtifactHandler | null {
    return this.defaultHandler ?? null;
  }

  getAllTypes(): ArtifactType[] {
    return Array.from(this.handlers.keys());
  }

  has(type: ArtifactType): boolean {
    return this.handlers.has(type);
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}

export const registry = new HandlerRegistry();
