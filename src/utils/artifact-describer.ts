import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { constants } from 'fs';

const MAX_DESCRIPTION_LENGTH = 500;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function describeArtifact(projectPath: string, slug: string): Promise<string> {
  const artifactsDir = join(projectPath, 'docs', 'artifacts', slug);
  const tsxPath = join(artifactsDir, 'content.tsx');
  const htmlPath = join(artifactsDir, 'index.html');

  // Prefer TSX if it exists
  const filePath = await fileExists(tsxPath) ? tsxPath : htmlPath;

  try {
    const content = await readFile(filePath, 'utf-8');
    // For TSX, strip JSX tags to get text content
    const textContent = filePath.endsWith('.tsx')
      ? stripJsx(content)
      : stripHtml(content);
    const truncated = truncateText(textContent, MAX_DESCRIPTION_LENGTH);
    return normalizeWhitespace(truncated);
  } catch {
    return '';
  }
}

function stripJsx(jsx: string): string {
  return jsx
    .replace(/<[^>]+>/g, ' ')          // Remove JSX/HTML tags
    .replace(/\{[^}]+\}/g, ' ')         // Remove JSX expressions
    .replace(/\/\/.*$/gm, ' ')          // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ' ')  // Remove multi-line comments
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
