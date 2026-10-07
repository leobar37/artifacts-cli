import chokidar, { type FSWatcher } from 'chokidar';
import path from 'path';
import { createLogger } from '../utils/logger.js';

const log = createLogger('watcher');

export interface WatchCallbacks {
  onInvalidate: (projectId: string) => void;
  onBroadcast: (projectId: string, slug: string) => void;
}

const DEBOUNCE_MS = 300;

export interface WatcherHandle {
  init(cb: WatchCallbacks): void;
  watch(projectId: string, artifactsPath: string): void;
  unwatch(projectId: string): void;
  stop(): void;
}

/** Per-server watcher factory: no shared module state between servers. */
export function createWatcher(): WatcherHandle {
  let watcher: FSWatcher | null = null;
  const watched = new Map<string, string>();
  let callbacks: WatchCallbacks | null = null;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function projectFor(filePath: string): string | null {
    let best: string | null = null;
    let bestLen = -1;
    for (const [projectId, base] of watched) {
      if ((filePath === base || filePath.startsWith(base + path.sep)) && base.length > bestLen) {
        best = projectId;
        bestLen = base.length;
      }
    }
    return best;
  }

  function emit(filePath: string): void {
    if (!callbacks) return;
    const projectId = projectFor(filePath);
    if (!projectId) return;
    const slug = filePath.split(path.sep).slice(-2)[0];
    const key = `${projectId}:${slug}`;
    const pending = timers.get(key);
    if (pending) clearTimeout(pending);
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      callbacks!.onInvalidate(projectId);
      callbacks!.onBroadcast(projectId, slug);
    }, DEBOUNCE_MS));
  }

  function ensureWatcher(): void {
    if (watcher) return;
    watcher = chokidar.watch([], {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
    });
    // Directory watches (not `**/index.html` globs: the chokidar v5 fork
    // does not reliably deliver events for glob paths added after boot).
    // Non-HTML events are filtered below: entry documents (.md/.mdx) and
    // sibling JSON sources refresh the owning artifact like index.html;
    // deletions flow through `unlink` (JSON removal flips hydrated views to
    // a visible error state; HTML keeps its previous no-unlink behavior).
    const relevant = (filePath: string): boolean =>
      filePath.endsWith(`${path.sep}index.html`) || /\.(md|mdx|json)$/.test(filePath);
    const relevantOnUnlink = (filePath: string): boolean => /\.(md|mdx|json)$/.test(filePath);
    watcher
      .on('add', (filePath: string) => {
        if (!relevant(filePath)) return;
        log.info(`file added: ${filePath}`);
        emit(filePath);
      })
      .on('change', (filePath: string) => {
        if (!relevant(filePath)) return;
        log.info(`change detected: ${filePath}`);
        emit(filePath);
      })
      .on('unlink', (filePath: string) => {
        if (!relevantOnUnlink(filePath)) return;
        log.info(`file removed: ${filePath}`);
        emit(filePath);
      })
      .on('error', (err: unknown) => {
        log.error(`error: ${err instanceof Error ? err.message : String(err)}`);
      });
  }

  return {
    init(cb: WatchCallbacks): void {
      callbacks = cb;
      ensureWatcher();
    },
    watch(projectId: string, artifactsPath: string): void {
      if (watched.has(projectId)) return;
      watched.set(projectId, artifactsPath);
      ensureWatcher();
      watcher!.add([artifactsPath]);
    },
    unwatch(projectId: string): void {
      const base = watched.get(projectId);
      watched.delete(projectId);
      if (!base || !watcher) return;
      watcher.unwatch([base]);
    },
    stop(): void {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      watched.clear();
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    },
  };
}

// Backwards-compatible singleton for current CLI callers.
const defaultWatcher = createWatcher();

export function initWatcher(cb: WatchCallbacks): void {
  defaultWatcher.init(cb);
}
export function watchProject(projectId: string, artifactsPath: string): void {
  defaultWatcher.watch(projectId, artifactsPath);
}
export function unwatchProject(projectId: string): void {
  defaultWatcher.unwatch(projectId);
}
export function stopWatcher(): void {
  defaultWatcher.stop();
}
