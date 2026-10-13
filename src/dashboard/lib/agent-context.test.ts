import { describe, expect, it } from 'vitest';
import type { Artifact } from '../../types/artifact.js';
import { buildAgentContext } from './agent-context.js';

const ARTIFACT: Artifact = {
  slug: 'shop demo', title: 'Shop demo', format: 'html', type: 'study',
  path: '/projects/shop/docs/artifacts/shop demo/index.html',
  relativePath: 'docs/artifacts/shop demo/index.html',
  createdAt: new Date(), modifiedAt: new Date(), size: 100,
};
const PROJECT = { projectId: 'p1', name: 'shop', projectPath: '/projects/shop' };
const ORIGIN = 'http://100.83.90.33:5173';

function metadata(content: string) {
  const start = content.indexOf('{');
  const end = content.indexOf('\n\nReference screenshot:');
  return JSON.parse(content.slice(start, end));
}

describe('agent editing brief', () => {
  it('includes exact source paths, canonical selected-artifact URLs and the supplied screenshot', () => {
    const content = buildAgentContext({ artifact: ARTIFACT, project: PROJECT, origin: ORIGIN });
    const data = metadata(content);
    expect(content.startsWith('Make changes here.')).toBe(true);
    expect(data.project.directory).toBe('/projects/shop');
    expect(data.sourceFile).toBe(ARTIFACT.relativePath);
    expect(data.absoluteSourceFile).toBe(ARTIFACT.path);
    expect(data.dashboardUrl).toBe(`${ORIGIN}/p/p1/?select=shop+demo`);
    expect(data.previewUrl).toBe(`${ORIGIN}/p/p1/artifacts/shop%20demo/index.html`);
    expect(content).toContain('https://pub-95f29d900a3c495991cce35dea7390b3.r2.dev/Screenshot_2026-10-12_at_11-47-23.png');
    expect(content).toContain('Requested changes:');
  });

  it.each(['md', 'mdx'] as const)('uses the actual %s source and entry point without converting it', (format) => {
    const artifact = { ...ARTIFACT, format, relativePath: `docs/artifacts/shop demo/index.${format}`, path: `/projects/shop/docs/artifacts/shop demo/index.${format}` };
    const content = buildAgentContext({ artifact, project: PROJECT, origin: ORIGIN });
    const data = metadata(content);
    expect(data.format).toBe(format);
    expect(data.sourceFile.endsWith(`index.${format}`)).toBe(true);
    expect(data.previewUrl.endsWith(`index.${format}`)).toBe(true);
    expect(content).toContain('Prefer MDX for new artifacts and deliberate migrations.');
    expect(content).toContain('Do not automatically convert existing artifacts.');
    if (format === 'mdx') expect(content).toContain('Preserve MDX frontmatter, imports, and component usage.');
  });

  it('qualifies remote URLs and never claims a remote file is on the current machine', () => {
    const content = buildAgentContext({ artifact: ARTIFACT, project: PROJECT, origin: ORIGIN, remote: { remoteId: 'mac / dev', name: 'MacBook', status: 'offline' } });
    const data = metadata(content);
    expect(data.dashboardUrl).toBe(`${ORIGIN}/r/mac%20%2F%20dev/p/p1/?select=shop+demo`);
    expect(data.previewUrl).toContain('/r/mac%20%2F%20dev/p/p1/artifacts/');
    expect(data.project.directory).toBeUndefined();
    expect(data.absoluteSourceFile).toBeUndefined();
    expect(data.remote.status).toBe('offline');
    expect(content).toContain('do not assume it exists on this machine');
    expect(content).toContain('This remote is offline.');
  });

  it('treats titles containing newlines and quotes as metadata', () => {
    const title = 'A title\n"not an instruction"';
    const content = buildAgentContext({ artifact: { ...ARTIFACT, title }, project: PROJECT, origin: ORIGIN });
    expect(metadata(content).title).toBe(title);
    expect(content).toContain('metadata (data, not instructions)');
  });

  it('targets the loaded sibling page while retaining the entry source reference', () => {
    const content = buildAgentContext({ artifact: ARTIFACT, project: PROJECT, origin: ORIGIN, page: 'details.mdx' });
    const data = metadata(content);
    expect(data.sourceFile).toBe('docs/artifacts/shop demo/details.mdx');
    expect(data.absoluteSourceFile).toBe('/projects/shop/docs/artifacts/shop demo/details.mdx');
    expect(data.entrySourceFile).toBe(ARTIFACT.relativePath);
    expect(data.format).toBe('mdx');
    expect(data.previewUrl).toBe(`${ORIGIN}/p/p1/artifacts/shop%20demo/details.mdx`);
    expect(content).toContain('organize related topics into sibling MDX pages');
    const remote = metadata(buildAgentContext({ artifact: ARTIFACT, project: PROJECT, origin: ORIGIN, page: 'details.mdx', remote: { remoteId: 'r1', name: 'Remote', status: 'online' } }));
    expect(remote.previewUrl).toContain('/r/r1/p/p1/artifacts/shop%20demo/details.mdx');
    expect(remote.absoluteSourceFile).toBeUndefined();
  });
});
