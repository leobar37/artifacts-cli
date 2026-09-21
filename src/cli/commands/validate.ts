import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { CompilationService } from '../../server/services/compiler.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cli:validate');

export function validateCommand(program: Command) {
  program
    .command('validate <slug>')
    .description('Validate a TSX artifact for errors')
    .action(async (slug: string) => {
      const cwd = process.cwd();
      const tsxPath = path.join(cwd, 'docs', 'artifacts', slug, 'content.tsx');

      if (!existsSync(tsxPath)) {
        log.error(`✗ TSX artifact not found: ${tsxPath}`);
        process.exit(1);
      }

      const sourceCode = readFileSync(tsxPath, 'utf-8');
      const compiler = new CompilationService();
      const result = await compiler.validate(sourceCode);

      if (result.valid && result.warnings.length === 0) {
        log.info(`✓ ${slug}: Valid TSX artifact`);
        process.exit(0);
      }

      if (result.errors.length > 0) {
        log.error(`✗ ${slug}: Compilation errors\n`);
        for (const err of result.errors) {
          const loc = err.line ? `:${err.line}${err.column ? `:${err.column}` : ''}` : '';
          log.error(`  Error${loc}: ${err.message}`);
        }
      }

      if (result.warnings.length > 0) {
        log.warn(`⚠ ${slug}: Warnings\n`);
        for (const warn of result.warnings) {
          log.warn(`  Warning: ${warn.message}`);
        }
      }

      if (!result.valid) {
        process.exit(1);
      }
    });
}
