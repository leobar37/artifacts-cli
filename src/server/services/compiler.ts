import { build, transform } from 'esbuild';
import { readFileSync, statSync } from 'fs';
import path from 'path';

export interface CompileOptions {
  filePath: string;
  cache?: boolean;
}

export interface CompileResult {
  code: string;
  success: true;
}

export interface CompileError {
  error: string;
  message: string;
  line?: number;
  column?: number;
  success: false;
}

export type CompileOutput = CompileResult | CompileError;

interface CacheEntry {
  code: string;
  compiledAt: Date;
  mtime: number;
}

export interface ValidateWarning {
  type: 'external_import' | 'named_export' | 'no_default_export';
  message: string;
  line?: number;
}

export interface ValidateResult {
  valid: boolean;
  errors: Array<{ message: string; line?: number; column?: number }>;
  warnings: ValidateWarning[];
}

export class CompilationService {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 50;

  async compile({ filePath, cache = true }: CompileOptions): Promise<CompileOutput> {
    // Check cache
    if (cache) {
      const cached = this.getFromCache(filePath);
      if (cached) {
        return { code: cached, success: true };
      }
    }

    // Read source
    let sourceCode: string;
    try {
      sourceCode = readFileSync(filePath, 'utf-8');
    } catch {
      return {
        error: 'FILE_NOT_FOUND',
        message: `Artifact source not found: ${filePath}`,
        success: false,
      };
    }

    // Compile with esbuild
    try {
      const result = await build({
        stdin: {
          contents: sourceCode,
          resolveDir: path.dirname(filePath),
          loader: 'tsx',
        },
        bundle: true,
        format: 'esm',
        target: 'es2020',
        external: ['react', 'react-dom'],
        write: false,
      });

      let code = result.outputFiles[0].text;
      code = `const React = window.__ARTIFACT_REACT__;\n${code}`;
      code = code.replace(/from\s+['"]react['"]/g, "from 'virtual:react'");
      code = code.replace(/import\s+\{([^}]+)\}\s+from\s+'virtual:react'/g, (_, imports) => {
        return `const { ${imports} } = React;`;
      });
      code = code.replace(/import\s+React\s+from\s+'virtual:react'/g, 'const React = window.__ARTIFACT_REACT__;');
      code = code.replace(/import\s+\*\s+as\s+React\s+from\s+'virtual:react'/g, 'const React = window.__ARTIFACT_REACT__;');

      // Save to cache
      if (cache) {
        this.saveToCache(filePath, code);
      }

      return { code, success: true };
    } catch (err: any) {
      const error = err as { message?: string; errors?: Array<{ text?: string; location?: { line?: number; column?: number } }> };
      const firstError = error.errors?.[0];
      return {
        error: 'COMPILATION_ERROR',
        message: firstError?.text || error.message || 'Unknown compilation error',
        line: firstError?.location?.line,
        column: firstError?.location?.column,
        success: false,
      };
    }
  }

  private getFromCache(filePath: string): string | undefined {
    const entry = this.cache.get(filePath);
    if (!entry) return undefined;

    // Check if file was modified since cache
    try {
      const mtime = statSync(filePath).mtimeMs;
      if (mtime === entry.mtime) {
        return entry.code;
      }
      // File changed, invalidate
      this.cache.delete(filePath);
    } catch {
      this.cache.delete(filePath);
    }
    return undefined;
  }

  private saveToCache(filePath: string, code: string): void {
    // LRU eviction if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    try {
      const mtime = statSync(filePath).mtimeMs;
      this.cache.set(filePath, { code, compiledAt: new Date(), mtime });
    } catch {
      // Can't stat file, skip caching
    }
  }

  async validate(sourceCode: string): Promise<ValidateResult> {
    const result: ValidateResult = { valid: true, errors: [], warnings: [] };

    // Check for default export
    if (!/export\s+default\s+/.test(sourceCode)) {
      result.warnings.push({
        type: 'no_default_export',
        message: 'Artifact must have an export default function',
      });
    }

    // Check for named exports (other than default)
    const namedExportMatch = sourceCode.match(/^export\s+(?!default\s)(?:const|function|class|let|var)\s+\w+/gm);
    if (namedExportMatch) {
      result.warnings.push({
        type: 'named_export',
        message: `Named exports found (${namedExportMatch.length}). Only export default is supported.`,
      });
    }

    // Try to compile with esbuild
    try {
      const buildResult = await build({
        stdin: {
          contents: sourceCode,
          resolveDir: process.cwd(),
          loader: 'tsx',
        },
        bundle: true,
        format: 'esm',
        target: 'es2020',
        external: ['react', 'react-dom'],
        write: false,
      });

      let code = buildResult.outputFiles[0].text;
      code = `const React = window.__ARTIFACT_REACT__;\n${code}`;
      code = code.replace(/from\s+['"]react['"]/g, "from 'virtual:react'");
      code = code.replace(/import\s+\{([^}]+)\}\s+from\s+'virtual:react'/g, (_, imports) => {
        return `const { ${imports} } = React;`;
      });
      code = code.replace(/import\s+React\s+from\s+'virtual:react'/g, 'const React = window.__ARTIFACT_REACT__;');
      code = code.replace(/import\s+\*\s+as\s+React\s+from\s+'virtual:react'/g, 'const React = window.__ARTIFACT_REACT__;');
    } catch (err: any) {
      const error = err as { errors?: Array<{ text?: string; location?: { line?: number; column?: number } }> };
      const firstError = error.errors?.[0];
      result.valid = false;
      result.errors.push({
        message: firstError?.text || 'Compilation error',
        line: firstError?.location?.line,
        column: firstError?.location?.column,
      });
    }

    return result;
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
