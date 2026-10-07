import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArtifactServer, type RunningArtifactServer } from '../index.js';
import { getMdxGuideSource } from '../markdown-viewer.js';


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
    expect(body).toContain('mv-stats');
    // Sections tutorial: card component + automatic index sidebar.
    expect(body).toContain('mv-section');
    expect(body).toContain('aria-label="Secciones"');
    expect(body).toContain('class="mv-toc-search"');
    expect(body).toContain('IntersectionObserver');
    // Declarative SVG tutorial renders inline svg.
    expect(body).toContain('<svg viewBox=');
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

  it('renders the JSON data views server-side from inline data', async () => {
    const res = await fetch(`${baseUrl}/mdx-guide`);
    expect(res.status).toBe(200);
    const body = await res.text();
    // TaskList (grouped), Kanban (columns) and Properties (dl rows) all
    // render fully server-side from literal data — no src placeholders here.
    expect(body).toContain('class="mv-data mv-tasklist"');
    expect(body).toContain('class="mv-data mv-kanban"');
    expect(body).toContain('class="mv-data mv-properties"');
    expect(body).toContain('First phase');
    expect(body).toContain('mv-data-group-label');
    expect(body).toContain('mv-kanban-col-label');
    expect(body).toContain('mv-badge');
    expect(body).toContain('mv-task-title');
    expect(body).toContain('<dt>');
    // The intentional invalid dataset renders its live error card.
    expect(body).toContain('mv-data-error');
    expect(body).toContain('role="alert"');
    // Inline-data guide never ships a hydration placeholder or its boot script
    // (the CSS class selector always ships; the placeholder markup must not).
    expect(body).not.toContain('class="mv-data mv-data-src"');
    expect(body).not.toContain('mvHydrateDataSrc');
  });

  it('teaches the sibling src form, limits and read-only contract', async () => {
    // Highlighting tokenizes fenced examples in the rendered HTML, so the
    // literal src forms are asserted against the bundled guide source.
    const source = getMdxGuideSource();
    expect(source).toContain('<TaskList src="tasks.json" groupBy="group" title="Work items" />');
    expect(source).toContain('<Kanban src="tasks.json" title="Status board" />');
    expect(source).toContain('<Properties src="profile.json" title="Execution profile" />');
    const body = await (await fetch(`${baseUrl}/mdx-guide`)).text();
    expect(body).toContain('tasks.json');
    expect(body).toContain('profile.json');
    expect(body).toContain('1 MiB');
    expect(body).toContain('1,000 items');
    expect(body).toContain('display-only');
    expect(body).toContain('no drag-and-drop');
    expect(body).toContain('credentials');
  });

  it('keeps the data views across theme queries', async () => {
    const body = await (await fetch(`${baseUrl}/mdx-guide?theme=dark`)).text();
    expect(body).toContain('data-theme="dark"');
    expect(body).toContain('mv-tasklist');
    expect(body).toContain('mv-properties');
  });
});
