import chokidar, { type FSWatcher } from 'chokidar';
import path from 'path';
import { createLogger } from '../utils/logger.js';

const log = createLogger('watcher');

interface WatchCallbacks {
  onInvalidate: (projectId: string) => void;
  onBroadcast: (projectId: string, slug: string) => void;
}

const DEBOUNCE_MS = 300;

/** One chokidar instance watching every registered project; events resolve by path prefix. */
let watcher: FSWatcher | null = null;
const watched = new Map<string, string>();
let callbacks: WatchCallbacks | null = null;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function ensureWatcher(): void {
  if (watcher) return;
  watcher = chokidar.watch([], {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true,
  });

  watcher
    .on('add', (filePath: string) => {
      log.info(`file added: ${filePath}`);
      emit(filePath);
    })
    .on('change', (filePath: string) => {
      log.info(`change detected: ${filePath}`);
      emit(filePath);
    })
    .on('error', (err: unknown) => {
      log.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    });
}

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

export function initWatcher(cb: WatchCallbacks): void {
  callbacks = cb;
  ensureWatcher();
}

export function watchProject(projectId: string, artifactsPath: string): void {
  if (watched.has(projectId)) return;
  watched.set(projectId, artifactsPath);
  ensureWatcher();
  watcher!.add([
    path.join(artifactsPath, '**', 'index.html'),
  ]);
}

export function unwatchProject(projectId: string): void {
  const base = watched.get(projectId);
  watched.delete(projectId);
  if (!base || !watcher) return;
  watcher.unwatch([
    path.join(base, '**', 'index.html'),
  ]);
}

export function stopWatcher(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  watched.clear();
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
