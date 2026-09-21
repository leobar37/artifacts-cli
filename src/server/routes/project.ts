import { Hono } from 'hono';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  readProjectConfig,
  patchProjectConfig,
  type ProjectConfig,
} from '../config/project-config.js';

interface PackageJson {
  name?: string;
}

function getProjectPath(): string {
  return process.env.ARTIFACT_PROJECT_PATH || process.cwd();
}

const router = new Hono();

router.get('/', (c) => {
  const projectPath = getProjectPath();

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
  const projectPath = getProjectPath();
  const config = readProjectConfig(projectPath);
  return c.json(config);
});

router.post('/config', async (c) => {
  const projectPath = getProjectPath();
  const body = (await c.req.json()) as Partial<ProjectConfig>;
  const config = patchProjectConfig(projectPath, body);
  return c.json(config);
});

export default router;
