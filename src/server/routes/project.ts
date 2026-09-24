import { Hono } from 'hono';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  readProjectConfig,
  patchProjectConfig,
  type ProjectConfig,
} from '../config/project-config.js';
import type { ProjectEnv } from '../../types/artifact.js';

interface PackageJson {
  name?: string;
}

const router = new Hono<ProjectEnv>();

router.get('/', (c) => {
  const projectPath = c.get('project').projectPath;

  try {
    const packageJsonPath = join(projectPath, 'package.json');
    const content = readFileSync(packageJsonPath, 'utf-8');
    const pkg: PackageJson = JSON.parse(content);

    return c.json({
      name: pkg.name || 'Unknown Project',
      path: projectPath,
    });
  } catch {
    const dirName = projectPath.split('/').pop() || 'Unknown Project';
    return c.json({
      name: dirName,
      path: projectPath,
    });
  }
});

router.get('/config', (c) => {
  const projectPath = c.get('project').projectPath;
  const config = readProjectConfig(projectPath);
  return c.json(config);
});

router.post('/config', async (c) => {
  const projectPath = c.get('project').projectPath;
  const body = (await c.req.json()) as Partial<ProjectConfig>;
  const config = patchProjectConfig(projectPath, body);
  return c.json(config);
});

export default router;
