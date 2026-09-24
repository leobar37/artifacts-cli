import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import type { Artifact, ArtifactIndex } from '../types/artifact.js';

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
    if (!existsSync(indexPath)) continue;

    try {
      const stats = statSync(indexPath);
      const html = readFileSync(indexPath, 'utf-8').slice(0, 50000);

      artifacts.push({
        slug: entry.name,
        title: extractTitle(html),
        path: indexPath,
        relativePath: path.join('docs', 'artifacts', entry.name, 'index.html'),
        type: detectType(html),
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
