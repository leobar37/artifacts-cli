import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArtifactServer, type RunningArtifactServer } from '../index.js';


let home: string;
let baseUrl: string;
let handle: RunningArtifactServer;
let prevDir: string | undefined;

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'artifact-guide-home-'));
  prevDir = process.env.ARTIFACT_DIR;
  process.env.ARTIFACT_DIR = join(home, 'dot-artifact');
  const port = 0; // OS-assigned: no parallel-test port races
  handle = await createArtifactServer({ port, host: '127.0.0.1', serveDashboard: false });
  baseUrl = `http://127.0.0.1:${handle.port}`;
}, 30000);

afterAll(async () => {
  await handle.stop();
  if (prevDir === undefined) delete process.env.ARTIFACT_DIR;
  else process.env.ARTIFACT_DIR = prevDir;
  rmSync(home, { recursive: true, force: true });
});

describe('GET /mdx-guide', () => {
  it('serves the component guide rendered through the mdx viewer', async () => {
    const res = await fetch(`${baseUrl}/mdx-guide`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')?.toLowerCase()).toBe('text/html; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.text();
    expect(body).toContain('mv-format">mdx');
    expect(body).toContain('recharts-bar');
    expect(body).toContain('recharts-pie');
    expect(body).toContain('mv-callout--info');
    expect(body).toContain('mv-stats');
    // Mermaid section: containers + client boot script.
    expect(body).toContain('mv-mermaid');
    expect(body).toContain('/assets/mermaid.min.js');
  });

  it('follows the theme query', async () => {
    const res = await fetch(`${baseUrl}/mdx-guide?theme=light`);
    expect(await res.text()).toContain('data-theme="light"');
  });

  it('serves the mermaid bundle for client-side diagrams', async () => {
    const res = await fetch(`${baseUrl}/assets/mermaid.min.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
    expect(res.headers.get('cache-control')).toContain('max-age');
    const body = await res.text();
    expect(body.length).toBeGreaterThan(1_000_000); // UMD bundle
    expect(body).toContain('mermaid');
  });
});
