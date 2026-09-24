import { Hono } from 'hono';
import { scanArtifacts } from '../../utils/scanner.js';
import { getProjectArtifactsPath } from '../../utils/project.js';
import { registry } from '../../handlers/registry.js';
import { sseRegistry } from '../sse.js';
import type { Artifact, ArtifactIndex, ProjectEnv } from '../../types/artifact.js';
import type { ArtifactType } from '../../handlers/interface.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('api');


const router = new Hono<ProjectEnv>();

const caches = new Map<string, { data: ArtifactIndex; timestamp: number }>();
const CACHE_TTL = 30000;

export function invalidateCache(projectId?: string): void {
  if (projectId === undefined) {
    caches.clear();
    return;
  }
  caches.delete(projectId);
}

function getCachedArtifacts(projectId: string, artifactsPath: string): ArtifactIndex {
  const now = Date.now();
  const cached = caches.get(projectId);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  const data = scanArtifacts(artifactsPath);
  caches.set(projectId, { data, timestamp: now });
  return data;
}

function isValidType(type: string): type is ArtifactType {
  return ['generic', 'study', 'wireframe'].includes(type);
}


router.get('/', (c) => {
  const project = c.get('project');
  const index = getCachedArtifacts(project.projectId, getProjectArtifactsPath(project.projectPath));
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


router.get('/:slug', (c) => {
  const project = c.get('project');
  const slug = c.req.param('slug');
  const index = getCachedArtifacts(project.projectId, getProjectArtifactsPath(project.projectPath));
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
  const project = c.get('project');
  const slug = c.req.param('slug');

  // Verify the artifact exists
  const index = getCachedArtifacts(project.projectId, getProjectArtifactsPath(project.projectPath));
  const artifact = index.artifacts.find((a: Artifact) => a.slug === slug);

  if (!artifact) {
    return c.json({ error: 'Artifact not found' }, 404);
  }

  // Invalidate cache to force re-scan
  invalidateCache(project.projectId);

  // Broadcast update event to this project's viewers
  sseRegistry.broadcastTo(project.projectId, 'artifacts:update', {
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
