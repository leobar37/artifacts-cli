import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanArtifacts } from '../scanner.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'artifact-scan-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeArtifact(slug: string, file: string, content: string): void {
  mkdirSync(join(dir, slug), { recursive: true });
  writeFileSync(join(dir, slug, file), content);
}

describe('scanArtifacts formats', () => {
  it('lists html artifacts with html format', () => {
    writeArtifact('legacy', 'index.html', '<html><head><title>Old</title></head><body></body></html>');
    const index = scanArtifacts(dir);
    expect(index.totalCount).toBe(1);
    expect(index.artifacts[0]).toMatchObject({ slug: 'legacy', format: 'html', title: 'Old' });
    expect(index.artifacts[0].relativePath).toBe(join('docs', 'artifacts', 'legacy', 'index.html'));
  });

  it('lists md artifacts with title from frontmatter and type from frontmatter', () => {
    writeArtifact(
      'notes',
      'index.md',
      '---\ntitle: Session Notes\ntype: study\n---\n\n# Ignored heading\n\nbody',
    );
    const found = scanArtifacts(dir).artifacts[0];
    expect(found).toMatchObject({ slug: 'notes', format: 'md', type: 'study', title: 'Session Notes' });
  });

  it('falls back to first H1 when frontmatter has no title', () => {
    writeArtifact('readme', 'index.md', '# Read Me\n\ncontent');
    const found = scanArtifacts(dir).artifacts[0];
    expect(found.title).toBe('Read Me');
    expect(found.type).toBe('generic');
  });

  it('falls back to humanized slug when no title exists', () => {
    writeArtifact('auth-summary', 'index.md', 'just body text');
    expect(scanArtifacts(dir).artifacts[0].title).toBe('Auth Summary');
  });

  it('lists mdx artifacts', () => {
    writeArtifact('doc', 'index.mdx', 'export const x = 1\n\n# Doc\n');
    const found = scanArtifacts(dir).artifacts[0];
    expect(found).toMatchObject({ slug: 'doc', format: 'mdx', title: 'Doc' });
  });

  it('prefers html when both html and md exist in the same slug', () => {
    writeArtifact('mixed', 'index.html', '<title>HTML</title>');
    writeArtifact('mixed', 'index.md', '# MD');
    expect(scanArtifacts(dir).artifacts[0].format).toBe('html');
  });

  it('ignores directories without an entry file', () => {
    mkdirSync(join(dir, 'empty'));
    expect(scanArtifacts(dir).totalCount).toBe(0);
  });
});
