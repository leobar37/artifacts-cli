import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWatcher, type WatcherHandle } from '../watcher.js';

interface Broadcast {
  project: string;
  slug: string;
}

// Integration exception (real platform clock): chokidar delivers native fs
// events and the watcher debounces on its own setTimeout, so fake timers
// cannot drive this suite. Real waits below only bound absence assertions.
const DEBOUNCE_MS = 300;

let base: string;
let watcher: WatcherHandle;
let invalidations: string[];
let broadcasts: Broadcast[];

function projectDir(id: string): string {
  const dir = join(base, id);
  mkdirSync(join(dir, 'board'), { recursive: true });
  return dir;
}

function watchProject(id: string): void {
  watcher.watch(id, join(base, id));
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 5000): Promise<void> {
  await vi.waitFor(() => expect(predicate(), label).toBe(true), { timeout: timeoutMs, interval: 50 });
}

// Real timers required: this suite exercises live chokidar delivery against
// the platform clock, which fake timers cannot drive.
const wait = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Deterministic readiness signal: writes a probe file and waits for its
 * event, proving the directory watch is armed. A probe written during the
 * initial scan would be swallowed by ignoreInitial, so the probe retries
 * until the watch delivers. The probe is never deleted, so it emits exactly
 * once; counters reset afterwards.
 */
async function armAndReset(id: string): Promise<void> {
  const probe = join(base, id, 'board', 'warmup.json');
  for (let attempt = 0; attempt < 10 && broadcasts.length === 0; attempt++) {
    writeFileSync(probe, `{"attempt":${attempt}}`);
    try {
      await waitFor(() => broadcasts.length >= 1, `watcher armed for ${id}`, 800);
    } catch {
      // Probe raced the initial scan and was swallowed; retry with a new
      // write so the armed watcher delivers a change event.
    }
  }
  expect(broadcasts.length, `watcher armed for ${id}`).toBeGreaterThanOrEqual(1);
  invalidations.length = 0;
  broadcasts.length = 0;
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'watcher-test-'));
  invalidations = [];
  broadcasts = [];
  watcher = createWatcher();
  watcher.init({
    onInvalidate: (projectId) => invalidations.push(projectId),
    onBroadcast: (projectId, slug) => broadcasts.push({ project: projectId, slug }),
  });
});

afterEach(() => {
  watcher.stop();
  rmSync(base, { recursive: true, force: true });
});

describe('createWatcher artifact events', () => {
  it('fires for sibling json add, change, and unlink with the owning slug', async () => {
    const dir = projectDir('p1');
    watchProject('p1');
    await armAndReset('p1');

    const file = join(dir, 'board', 'tasks.json');
    writeFileSync(file, '{"version":1,"items":[]}');
    await waitFor(() => broadcasts.length === 1, 'json add event');
    expect(broadcasts[0]).toEqual({ project: 'p1', slug: 'board' });
    expect(invalidations).toEqual(['p1']);

    invalidations.length = 0;
    broadcasts.length = 0;
    writeFileSync(file, '{"version":1,"items":[{"id":"T-1","title":"x","status":"pending"}]}');
    await waitFor(() => broadcasts.length === 1, 'json change event');
    expect(broadcasts[0]).toEqual({ project: 'p1', slug: 'board' });
    expect(invalidations).toEqual(['p1']);

    invalidations.length = 0;
    broadcasts.length = 0;
    unlinkSync(file);
    await waitFor(() => broadcasts.length === 1, 'json unlink event');
    expect(broadcasts[0]).toEqual({ project: 'p1', slug: 'board' });
    expect(invalidations).toEqual(['p1']);
  });

  it('fires for md and mdx entry changes', async () => {
    const dir = projectDir('p1');
    watchProject('p1');
    await armAndReset('p1');

    writeFileSync(join(dir, 'board', 'index.md'), '# Board\n');
    await waitFor(() => broadcasts.length === 1, 'md event');
    expect(broadcasts[0]).toEqual({ project: 'p1', slug: 'board' });

    writeFileSync(join(dir, 'board', 'index.mdx'), '# Board MDX\n');
    await waitFor(() => broadcasts.length === 2, 'mdx event');
    expect(broadcasts[1]).toEqual({ project: 'p1', slug: 'board' });
  });

  it('keeps same-slug projects isolated: only the owning project fires', async () => {
    projectDir('alpha');
    projectDir('beta');
    watchProject('alpha');
    watchProject('beta');
    await armAndReset('alpha');
    await armAndReset('beta');

    writeFileSync(join(base, 'alpha', 'board', 'tasks.json'), '{}');
    await waitFor(() => broadcasts.length === 1, 'alpha event');
    // Absence assertion: give a stray beta event (watcher delivery + its own
    // debounce) real time to surface; only the platform clock can do this.
    await wait(DEBOUNCE_MS + 500);

    expect(broadcasts).toEqual([{ project: 'alpha', slug: 'board' }]);
    expect(invalidations).toEqual(['alpha']);
  });

  it('still emits for index.html additions', async () => {
    const dir = projectDir('p1');
    watchProject('p1');
    await armAndReset('p1');

    writeFileSync(join(dir, 'board', 'index.html'), '<h1>board</h1>');
    await waitFor(() => broadcasts.length === 1, 'index.html event');
    expect(broadcasts[0]).toEqual({ project: 'p1', slug: 'board' });
  });

  it('coalesces rapid writes into one debounced emit', async () => {
    const dir = projectDir('p1');
    watchProject('p1');
    await armAndReset('p1');

    const file = join(dir, 'board', 'tasks.json');
    writeFileSync(file, '1');
    writeFileSync(file, '2');
    writeFileSync(file, '3');
    await waitFor(() => broadcasts.length >= 1, 'debounced emit');
    // Absence assertion for the second debounce window (platform clock).
    await wait(DEBOUNCE_MS + 500);

    expect(broadcasts.length).toBe(1);
    expect(invalidations.length).toBe(1);
    expect(broadcasts[0]).toEqual({ project: 'p1', slug: 'board' });
  });

  it('ignores dotfiles and non-artifact extensions', async () => {
    const dir = projectDir('p1');
    watchProject('p1');
    await armAndReset('p1');

    writeFileSync(join(dir, 'board', '.hidden.json'), '{}');
    writeFileSync(join(dir, 'board', 'notes.txt'), 'hi');
    // Absence assertion: nothing should ever emit (platform clock).
    await wait(DEBOUNCE_MS + 700);

    expect(broadcasts).toEqual([]);
    expect(invalidations).toEqual([]);
  });
});
