import { describe, it, expect, beforeEach } from 'vitest';
import { CompilationService } from '../compiler.js';

describe('CompilationService.validate', () => {
  let service: CompilationService;

  beforeEach(() => {
    service = new CompilationService();
  });

  it('should validate a correct TSX artifact', async () => {
    const code = `
import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}`;

    const result = await service.validate(code);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('should return errors for syntax errors', async () => {
    const code = `export default function Broken { return <div>bad</div>; }`;

    const result = await service.validate(code);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].line).toBeDefined();
  });

  it('should warn about missing default export', async () => {
    const code = `function NoExport() { return <div>Hello</div>; }`;

    const result = await service.validate(code);

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ type: 'no_default_export' }),
    );
  });

  it('should warn about external imports', async () => {
    const code = `
import { useState } from 'react';
import lodash from 'lodash';

export default function WithExternal() {
  return <div>Hello</div>;
}`;

    const result = await service.validate(code);

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'external_import',
        message: expect.stringContaining('lodash'),
      }),
    );
  });

  it('should allow imports from react and react/*', async () => {
    const code = `
import { useState } from 'react';

export default function OK() {
  const [x] = useState(0);
  return <div>{x}</div>;
}`;

    const result = await service.validate(code);

    expect(result.valid).toBe(true);
    const importWarnings = result.warnings.filter(w => w.type === 'external_import');
    expect(importWarnings).toHaveLength(0);
  });

  it('should warn about named exports', async () => {
    const code = `
export const helper = () => 1;
export default function Main() { return <div>{helper()}</div>; }`;

    const result = await service.validate(code);

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ type: 'named_export' }),
    );
  });
});
