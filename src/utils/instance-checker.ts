import type { InstanceLock } from '../types/artifact.js';
import http from 'http';

export async function isInstanceAlive(instance: InstanceLock): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${instance.port}/api/health`, (res) => {
      if (res.statusCode === 200) {
        // Verify the PID is actually running
        try {
          process.kill(instance.pid, 0);
          resolve(true);
        } catch {
          resolve(false);
        }
      } else {
        resolve(false);
      }
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.setTimeout(2000);
  });
}
