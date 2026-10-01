import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveArtifactFile } from '../index.js';

let base: string;
let app: Hono;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'artifact-serve-'));
  mkdirSync(join(base, 'notes'), { recursive: true });
  writeFileSync(join(base, 'notes', 'index.md'), '# Notes\n\n- item\n');
  mkdirSync(join(base, 'legacy'), { recursive: true });
  writeFileSync(join(base, 'legacy', 'index.html'), '<h1>old</h1>');

  app = new Hono();
  app.on(['GET', 'HEAD'], '/artifacts/*', (c) =>
    serveArtifactFile(c, base, c.req.path.replace(/^\/artifacts/, '')),
  );
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('serveArtifactFile markdown', () => {
  it('serves md as the viewer page (html, no-store)', async () => {
    const res = await app.request('/artifacts/notes/index.md');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.text();
    expect(body).toContain('<h1>Notes</h1>');
    expect(body).toContain('mv-format">md');
  });

  it('serves the raw source with ?raw=1 as text/markdown', async () => {
    const res = await app.request('/artifacts/notes/index.md?raw=1');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(await res.text()).toBe('# Notes\n\n- item\n');
  });

  it('honors ?theme=light', async () => {
    const res = await app.request('/artifacts/notes/index.md?theme=light');
    expect(await res.text()).toContain('data-theme="light"');
  });

  it('serves mdx through the viewer with the mdx badge', async () => {
    mkdirSync(join(base, 'doc'), { recursive: true });
    writeFileSync(join(base, 'doc', 'index.mdx'), 'export const x = 1\n\n# Doc\n');
    const res = await app.request('/artifacts/doc/index.mdx');
    const body = await res.text();
    expect(body).toContain('mv-format">mdx');
    expect(body).toContain('<h1>Doc</h1>');
    expect(body).not.toContain('export const x');
  });

  it('keeps html artifacts untouched', async () => {
    const res = await app.request('/artifacts/legacy/index.html');
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await res.text()).toBe('<h1>old</h1>');
  });

  it('still blocks traversal', async () => {
    const res = await app.request('/artifacts/..%2f..%2fetc%2fpasswd');
    expect(res.status).toBe(403);
  });
});
