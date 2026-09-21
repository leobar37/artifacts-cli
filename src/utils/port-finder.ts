import { createServer } from 'net';

const MIN_PORT = 7000;
const MAX_PORT = 7100;

// Puertos reservados por navegadores (Chrome/Chromium bloquean estos)
// Ver: https://chromium.googlesource.com/chromium/src.git/+/refs/heads/main/net/base/port_util.cc
const RESERVED_PORTS = new Set<number>([]);

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

export async function findAvailablePort(preferred?: number): Promise<number> {
  // If preferred port is specified, try it first (incluyendo fuera del rango)
  if (preferred && preferred >= MIN_PORT && preferred <= MAX_PORT) {
    if (!RESERVED_PORTS.has(preferred) && await isPortAvailable(preferred)) {
      return preferred;
    }
  }

  // Search for available port in range, saltando los reservados
  for (let port = MIN_PORT; port <= MAX_PORT; port++) {
    if (RESERVED_PORTS.has(port)) continue;
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No available ports found in range ${MIN_PORT}-${MAX_PORT}`);
}
