import { Hono } from 'hono';
import path from 'path';
import { existsSync } from 'fs';
import { scanArtifacts } from '../../utils/scanner.js';
import { registry } from '../../handlers/registry.js';
import { CompilationService } from '../services/compiler.js';
import { sseRegistry } from '../sse.js';
import type { Artifact, ArtifactIndex } from '../../types/artifact.js';
import type { ArtifactType } from '../../handlers/interface.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('api');

const compiler = new CompilationService();

const router = new Hono();

let cache: { data: ArtifactIndex; timestamp: number } | null = null;
const CACHE_TTL = 30000;

export function invalidateCache(): void {
  cache = null;
}

function getCachedArtifacts(artifactsPath: string): ArtifactIndex {
  const now = Date.now();
  if (cache && now - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }
  const data = scanArtifacts(artifactsPath);
  cache = { data, timestamp: now };
  return data;
}

function isValidType(type: string): type is ArtifactType {
  return ['generic', 'study', 'wireframe'].includes(type);
}

router.get('/', (c) => {
  const artifactsPath = process.env.ARTIFACT_ARTIFACTS_PATH || './docs/artifacts';
  const index = getCachedArtifacts(artifactsPath);
  const type = c.req.query('type');

  if (type && typeof type === 'string') {
    if (!isValidType(type)) {
      return c.json({ error: `Invalid type "${type}". Must be one of: generic, study, wireframe` }, 400);
    }
    const handler = registry.get(type);
    if (handler) {
      return c.json({
        artifacts: handler.list(index.artifacts),
        totalCount: handler.list(index.artifacts).length,
        lastScanAt: index.lastScanAt,
      });
    }
  }

  return c.json(index);
});

router.post('/validate', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.code !== 'string') {
    return c.json({ error: 'Request body must include { code: string }' }, 400);
  }

  const result = await compiler.validate(body.code);
  return c.json(result);
});

router.get('/:slug/bundle', async (c) => {
  const slug = c.req.param('slug');
  const artifactsPath = process.env.ARTIFACT_ARTIFACTS_PATH || './docs/artifacts';
  const filePath = path.join(artifactsPath, slug, 'content.tsx');

  if (!existsSync(filePath)) {
    return c.json({ error: 'NOT_FOUND', message: 'Artifact TSX source not found' }, 404);
  }

  const result = await compiler.compile({ filePath });

  if (!result.success) {
    return c.json(result, 400);
  }

  return c.text(result.code, 200, {
    'Content-Type': 'application/javascript',
    'Cache-Control': 'no-cache',
  });
});

router.get('/:slug', (c) => {
  const slug = c.req.param('slug');
  const artifactsPath = process.env.ARTIFACT_ARTIFACTS_PATH || './docs/artifacts';
  const index = getCachedArtifacts(artifactsPath);
  const artifact = index.artifacts.find((a: Artifact) => a.slug === slug);

  if (!artifact) {
    return c.json({ error: 'Artifact not found' }, 404);
  }

  const handler = isValidType(artifact.type)
    ? (registry.get(artifact.type) ?? registry.getDefault())
    : registry.getDefault();

  return c.json({
    artifact,
    handler: handler ? {
      type: handler.type,
      renderHints: handler.renderHints,
    } : null,
  });
});

// Trigger reload for a specific artifact (used by CLI after code edits)
router.post('/:slug/reload', (c) => {
  const slug = c.req.param('slug');
  const artifactsPath = process.env.ARTIFACT_ARTIFACTS_PATH || './docs/artifacts';

  // Verify the artifact exists
  const index = getCachedArtifacts(artifactsPath);
  const artifact = index.artifacts.find((a: Artifact) => a.slug === slug);

  if (!artifact) {
    return c.json({ error: 'Artifact not found' }, 404);
  }

  // Invalidate cache to force re-scan
  invalidateCache();

  // Broadcast update event to all connected clients
  sseRegistry.broadcast('artifacts:update', {
    slug,
    lastScanAt: new Date().toISOString(),
  });

  log.info(`Triggered reload for artifact: ${slug}`);

  return c.json({
    success: true,
    slug,
    message: `Reload triggered for ${slug}`,
  });
});

export default router;
