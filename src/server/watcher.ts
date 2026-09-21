import chokidar, { type FSWatcher } from 'chokidar';
import path from 'path';
import { createLogger } from '../utils/logger.js';

const log = createLogger('watcher');

interface WatcherOptions {
  artifactsPath: string;
  onInvalidate: () => void;
  onBroadcast: (slug: string) => void;
}

let watcher: FSWatcher | null = null;

export function startWatcher({ artifactsPath, onInvalidate, onBroadcast }: WatcherOptions): void {
  if (watcher) return;

  watcher = chokidar.watch([
    path.join(artifactsPath, '**', 'index.html'),
    path.join(artifactsPath, '**', 'content.tsx'),
  ], {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true,
  });

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 300;

  const emit = (filePath: string) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      onInvalidate();
      const slug = filePath.split('/').slice(-2)[0];
      onBroadcast(slug);
    }, DEBOUNCE_MS);
  };

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

export function stopWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
