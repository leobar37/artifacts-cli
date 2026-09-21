import { EventEmitter } from "node:events";
import { createLogger } from "../../utils/logger.js";
import type { PiDashboardEvent } from "./pi-agent-service.js";

const log = createLogger("pi-event-bus");

/** Per-session event bus for Pi dashboard events */
export class PiEventBus {
  private buses = new Map<string, EventEmitter>();

  /** Get or create an event bus for a session */
  private getBus(sessionId: string): EventEmitter {
    let bus = this.buses.get(sessionId);
    if (!bus) {
      bus = new EventEmitter();
      // Increase max listeners to handle multiple SSE clients + internal consumers
      bus.setMaxListeners(50);
      this.buses.set(sessionId, bus);
      log.info(`Created event bus for session ${sessionId.slice(0, 8)}...`);
    }
    return bus;
  }

  /** Publish an event to a specific session */
  publish(sessionId: string, event: PiDashboardEvent): void {
    const bus = this.getBus(sessionId);
    bus.emit("event", event);
  }

  /** Subscribe to events for a specific session */
  subscribe(sessionId: string, listener: (event: PiDashboardEvent) => void): () => void {
    const bus = this.getBus(sessionId);
    bus.on("event", listener);
    log.info(`Subscriber added for session ${sessionId.slice(0, 8)}...`);

    return () => {
      bus.off("event", listener);
      // Clean up empty buses
      if (bus.listenerCount("event") === 0) {
        this.buses.delete(sessionId);
        log.info(`Cleaned up event bus for session ${sessionId.slice(0, 8)}...`);
      }
    };
  }

  /** Dispose a session's event bus */
  dispose(sessionId: string): void {
    const bus = this.buses.get(sessionId);
    if (bus) {
      bus.removeAllListeners();
      this.buses.delete(sessionId);
      log.info(`Disposed event bus for session ${sessionId.slice(0, 8)}...`);
    }
  }

  /** Get active session count */
  get activeSessions(): number {
    return this.buses.size;
  }
}

/** Singleton instance */
export const piEventBus = new PiEventBus();
