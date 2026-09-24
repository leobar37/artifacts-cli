import type { SSEStreamingApi } from "hono/streaming";

interface SSEClient {
  id: string;
  projectId: string;
  stream: SSEStreamingApi;
}

/** Clients subscribe per project; broadcasts only reach that project's viewers. */
class SSERegistry {
  private clients = new Map<string, SSEClient>();
  private counter = 0;

  add(stream: SSEStreamingApi, projectId: string): string {
    const id = `client_${++this.counter}`;
    this.clients.set(id, { id, projectId, stream });
    return id;
  }

  remove(id: string): void {
    this.clients.delete(id);
  }

  removeByProject(projectId: string): void {
    for (const [id, client] of this.clients) {
      if (client.projectId === projectId) this.clients.delete(id);
    }
  }

  async broadcastTo(projectId: string, event: string, data: unknown): Promise<void> {
    const payload = JSON.stringify(data);
    for (const client of this.clients.values()) {
      if (client.projectId !== projectId) continue;
      await client.stream.writeSSE({ event, data: payload });
    }
  }

  get size(): number {
    return this.clients.size;
  }
}

export const sseRegistry = new SSERegistry();
