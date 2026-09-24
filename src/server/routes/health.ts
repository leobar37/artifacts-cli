import { Hono } from 'hono';

const router = new Hono();

router.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.ARTIFACT_VERSION || '0.1.0',
  });
});

export default router;
