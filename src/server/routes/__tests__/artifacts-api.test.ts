import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// The scanner only recognizes index.html: one file per artifact, title from
// <title>, type from the artifact-type meta tag (or heuristics).
describe('Scanner: HTML artifacts', () => {
  const tmpDir = path.join(os.tmpdir(), `artifact-test-${Date.now()}`);
  const slug = 'test-integration';
  const artifactDir = path.join(tmpDir, slug);
  const htmlPath = path.join(artifactDir, 'index.html');

  beforeAll(() => {
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(htmlPath, `<html><head><title>Integration</title><meta name="artifact-type" content="study"></head><body>x</body></html>`);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should detect an HTML artifact via scanner', async () => {
    const { scanArtifacts } = await import('../../../utils/scanner.js');

    const index = scanArtifacts(tmpDir);

    expect(index.totalCount).toBe(1);
    expect(index.artifacts[0].slug).toBe(slug);
    expect(index.artifacts[0].title).toBe('Integration');
    expect(index.artifacts[0].type).toBe('study');
  });

  it('should skip directories without index.html', async () => {
    const { scanArtifacts } = await import('../../../utils/scanner.js');
    fs.mkdirSync(path.join(tmpDir, 'empty-dir'), { recursive: true });

    const index = scanArtifacts(tmpDir);

    expect(index.totalCount).toBe(1);
  });
});
