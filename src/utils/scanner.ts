import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import type { Artifact, ArtifactFormat, ArtifactIndex } from '../types/artifact.js';

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

    const indexPath = path.join(artifactsPath, entry.name, 'index.html');
    const tsxPath = path.join(artifactsPath, entry.name, 'content.tsx');
    const hasHtml = existsSync(indexPath);
    const hasTsx = existsSync(tsxPath);

    // Must have at least one artifact file
    if (!hasHtml && !hasTsx) continue;

    const format: ArtifactFormat = hasTsx ? 'tsx' : 'html';

    try {
      let title = entry.name;
      let type: Artifact['type'] = 'generic';
      let size = 0;
      let createdAt: Date;
      let modifiedAt: Date;

      if (hasHtml) {
        const stats = statSync(indexPath);
        const html = readFileSync(indexPath, 'utf-8').slice(0, 50000);
        title = extractTitle(html);
        type = detectType(html);
        size = stats.size;
        createdAt = stats.birthtime;
        modifiedAt = stats.mtime;
      } else {
        const stats = statSync(tsxPath);
        size = stats.size;
        createdAt = stats.birthtime;
        modifiedAt = stats.mtime;
      }

      // If TSX exists, add its size too
      if (hasTsx && hasHtml) {
        const tsxStats = statSync(tsxPath);
        size += tsxStats.size;
        if (tsxStats.mtime > modifiedAt) {
          modifiedAt = tsxStats.mtime;
        }
      }

      artifacts.push({
        slug: entry.name,
        title,
        path: hasTsx ? tsxPath : indexPath,
        relativePath: path.join('docs', 'artifacts', entry.name, format === 'tsx' ? 'content.tsx' : 'index.html'),
        type,
        format,
        createdAt,
        modifiedAt,
        size,
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
