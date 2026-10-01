import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import type { Artifact, ArtifactFormat, ArtifactIndex } from '../types/artifact.js';

/** Entry filename per format; the scanner accepts any of them per slug. */
const FORMAT_FILES: Record<ArtifactFormat, string> = {
  html: 'index.html',
  md: 'index.md',
  mdx: 'index.mdx',
};

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1]?.trim() || 'Untitled Artifact';
}

function detectType(html: string): Artifact['type'] {
  // Check for meta tag first
  const metaMatch = html.match(
    /<meta[^>]*name=["']artifact-type["'][^>]*content=["']([^"']*)["']/i
  );
  if (metaMatch) {
    const type = metaMatch[1].toLowerCase();
    if (['generic', 'study', 'wireframe'].includes(type)) {
      return type as Artifact['type'];
    }
  }

  // Heuristics
  if (html.includes('x-data=') || html.includes('x-init=')) return 'study';
  if (html.includes('wireframe') || html.includes('mockup')) return 'wireframe';
  return 'generic';
}

export interface MarkdownFrontmatter {
  title?: string;
  type?: string;
  body: string;
}

/** Split leading `---` YAML frontmatter from a markdown/mdx document. */
function splitFrontmatter(source: string): MarkdownFrontmatter {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { body: source };
  const meta: MarkdownFrontmatter = { body: source.slice(match[0].length) };
  for (const line of match[1].split(/\r?\n/)) {
    const entry = line.match(/^([A-Za-z-]+)\s*:\s*(.+?)\s*$/);
    if (!entry) continue;
    const value = entry[2].replace(/^["']|["']$/g, '');
    if (entry[1] === 'title') meta.title = value;
    if (entry[1] === 'type' || entry[1] === 'artifact-type') meta.type = value.toLowerCase();
  }
  return meta;
}

function markdownTitle(source: string, slug: string): string {
  const front = splitFrontmatter(source);
  if (front.title) return front.title;
  const heading = front.body.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return slug
    .split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function markdownType(source: string): Artifact['type'] {
  const type = splitFrontmatter(source).type;
  return ['generic', 'study', 'wireframe'].includes(type ?? '')
    ? (type as Artifact['type'])
    : 'generic';
}

/** First format whose entry file exists in the slug directory. */
function detectFormat(dir: string): { format: ArtifactFormat; file: string } | null {
  for (const format of ['html', 'md', 'mdx'] as const) {
    const file = path.join(dir, FORMAT_FILES[format]);
    if (existsSync(file)) return { format, file };
  }
  return null;
}

export function scanArtifacts(artifactsPath: string): ArtifactIndex {
  if (!existsSync(artifactsPath)) {
    return {
      artifacts: [],
      totalCount: 0,
      lastScanAt: new Date(),
    };
  }

  const artifacts: Artifact[] = [];
  const entries = readdirSync(artifactsPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const found = detectFormat(path.join(artifactsPath, entry.name));
    if (!found) continue;

    try {
      const stats = statSync(found.file);
      const source = readFileSync(found.file, 'utf-8').slice(0, 50000);
      const isMarkdown = found.format !== 'html';

      artifacts.push({
        slug: entry.name,
        title: isMarkdown ? markdownTitle(source, entry.name) : extractTitle(source),
        path: found.file,
        relativePath: path.join('docs', 'artifacts', entry.name, path.basename(found.file)),
        type: isMarkdown ? markdownType(source) : detectType(source),
        format: found.format,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        size: stats.size,
      });
    } catch {
      continue;
    }
  }

  // Sort by modification date, newest first
  artifacts.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());

  return {
    artifacts,
    totalCount: artifacts.length,
    lastScanAt: new Date(),
  };
}
