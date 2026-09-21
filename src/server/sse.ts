import type { SSEStreamingApi } from "hono/streaming";

interface SSEClient {
  id: string;
  stream: SSEStreamingApi;
}

class SSERegistry {
  private clients = new Map<string, SSEClient>();
  private counter = 0;

  add(stream: SSEStreamingApi): string {
    const id = `client_${++this.counter}`;
    this.clients.set(id, { id, stream });
    return id;
  }

  remove(id: string): void {
    this.clients.delete(id);
  }

  async broadcast(event: string, data: unknown): Promise<void> {
    const payload = JSON.stringify(data);
    for (const client of this.clients.values()) {
      await client.stream.writeSSE({ event, data: payload });
    }
  }

  get size(): number {
    return this.clients.size;
  }
}

export const sseRegistry = new SSERegistry();
