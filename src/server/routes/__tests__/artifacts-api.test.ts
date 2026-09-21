import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Test the compilation pipeline end-to-end
describe('Integration: TSX Artifact Pipeline', () => {
  const tmpDir = path.join(os.tmpdir(), `artifact-test-${Date.now()}`);
  const slug = 'test-integration';
  const artifactDir = path.join(tmpDir, slug);
  const tsxPath = path.join(artifactDir, 'content.tsx');

  beforeAll(() => {
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(tsxPath, `
import { useState } from 'react';

export default function TestComponent() {
  const [count, setCount] = useState(0);
  return <div onClick={() => setCount(c => c + 1)}>Count: {count}</div>;
}
`);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should compile TSX artifact via CompilationService', async () => {
    const { CompilationService } = await import('../../services/compiler.js');
    const service = new CompilationService();

    const result = await service.compile({ filePath: tsxPath });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.code).toContain('TestComponent');
      expect(result.code).toContain('useState');
      expect(result.code).toContain('Count:');
    }
  });

  it('should detect TSX format via scanner', async () => {
    process.env.ARTIFACT_ARTIFACTS_PATH = tmpDir;
    const { scanArtifacts } = await import('../../../utils/scanner.js');

    const index = scanArtifacts(tmpDir);

    expect(index.totalCount).toBe(1);
    expect(index.artifacts[0].format).toBe('tsx');
    expect(index.artifacts[0].slug).toBe(slug);
  });

  it('should return compilation error for invalid TSX', async () => {
    const { CompilationService } = await import('../../services/compiler.js');
    const service = new CompilationService();

    const badPath = path.join(artifactDir, 'bad.tsx');
    fs.writeFileSync(badPath, 'export default function Broken { return <div>bad</div>; }');

    const result = await service.compile({ filePath: badPath });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('COMPILATION_ERROR');
    }

    fs.unlinkSync(badPath);
  });
});
