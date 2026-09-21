import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { createLogger } from "../../utils/logger.js";
import type { ArtifactSession } from "../session/types.js";

const log = createLogger("pi-agent-service");

/** Event types emitted by PiAgentService */
export interface PiDashboardEvent {
  type:
    | "agent:start"
    | "agent:end"
    | "agent:turn:start"
    | "agent:turn:end"
    | "chat:message:start"
    | "chat:message:end"
    | "chat:text:delta"
    | "chat:reasoning:start"
    | "chat:reasoning:delta"
    | "chat:reasoning:end"
    | "chat:tool:start"
    | "chat:tool:update"
    | "chat:tool:end"
    | "chat:error"
    | "session:info";
  sessionId: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

/** Internal Pi RPC event (from pi --mode rpc stdout) */
type PiRpcEvent =
  | { type: "session"; version: number; id: string; timestamp: string; cwd: string }
  | { type: "agent_start" }
  | { type: "agent_end"; messages: unknown[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: unknown; toolResults: unknown[] }
  | { type: "message_start"; message: unknown }
  | { type: "message_update"; message: unknown; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: unknown }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: unknown; partialResult: unknown }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: "queue_update"; steering: readonly string[]; followUp: readonly string[] }
  | { type: "compaction_start"; reason: string }
  | { type: "compaction_end"; reason: string; result: unknown; aborted: boolean }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number }
  | { type: "auto_retry_end"; success: boolean; attempt: number };

type AssistantMessageEvent =
  | { type: "text_delta"; delta: string }
  | { type: "reasoning_delta"; delta: string }
  | { type: "tool_call"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_result"; toolCallId: string; toolName: string; result: unknown; isError: boolean };

/** Options for PiAgentService */
export interface PiAgentServiceOptions {
  cwd?: string;
  model?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  sessionDir?: string;
  maxSteps?: number;
}

/** Manages a pi --mode rpc process and transforms events to dashboard format */
export class PiAgentService {
  private process: ChildProcess | null = null;
  private eventEmitter = new EventEmitter();
  private sessionId: string | null = null;
  private cwd: string;
  private model: string | undefined;
  private thinkingLevel: string | undefined;
  private sessionDir: string | undefined;
  private maxSteps: number;
  private currentTurn = 0;
  private messageCounter = 0;
  private currentMessageId: string | null = null;
  private currentReasoningId: string | null = null;
  private currentToolId: string | null = null;
  private buffer = "";
  private _isRunning = false;

  constructor(options: PiAgentServiceOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    this.model = options.model;
    this.thinkingLevel = options.thinkingLevel;
    this.sessionDir = options.sessionDir;
    this.maxSteps = options.maxSteps ?? 10;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /** Start the pi RPC process */
  async start(): Promise<void> {
    if (this._isRunning) return;

    const args = ["--mode", "rpc"];
    if (this.model) args.push("--model", this.model);
    if (this.thinkingLevel) args.push("--thinking", this.thinkingLevel);
    if (this.sessionDir) args.push("--session-dir", this.sessionDir);

    log.info(`Starting pi RPC: pi ${args.join(" ")} (cwd: ${this.cwd})`);

    this.process = spawn("pi", args, {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      this.handleStdout(data.toString("utf-8"));
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const text = data.toString("utf-8").trim();
      if (text) log.warn(`[pi stderr] ${text}`);
    });

    this.process.on("exit", (code, signal) => {
      log.info(`pi process exited: code=${code}, signal=${signal}`);
      this._isRunning = false;
      this.process = null;
    });

    this.process.on("error", (err) => {
      log.error(`pi process error:`, err);
      this._isRunning = false;
    });

    // Wait a bit for the process to be ready
    await new Promise((resolve) => setTimeout(resolve, 500));
    this._isRunning = true;
    log.info("pi RPC process started");
  }

  /** Stop the pi RPC process */
  async stop(): Promise<void> {
    if (!this.process) return;

    log.info("Stopping pi RPC process");
    this.process.stdin?.end();
    this.process.kill("SIGTERM");

    // Force kill after timeout
    setTimeout(() => {
      if (this.process && !this.process.killed) {
        this.process.kill("SIGKILL");
      }
    }, 5000);

    this._isRunning = false;
    this.process = null;
  }

  /** Send a prompt to the agent */
  async prompt(text: string, artifactSession: ArtifactSession): Promise<void> {
    if (!this._isRunning || !this.process) {
      throw new Error("Pi agent is not running");
    }

    this.sessionId = artifactSession.id;
    this.currentTurn = 0;

    // Send new_session if needed, or load existing
    if (artifactSession.providerSessionId) {
      // Try to resume existing pi session
      await this.sendCommand({
        type: "new_session",
        parentSession: artifactSession.providerSessionId,
      });
    } else {
      await this.sendCommand({ type: "new_session" });
    }

    // Set model if specified
    if (artifactSession.model) {
      await this.sendCommand({ type: "set_model", model: artifactSession.model });
    }

    // Send the prompt
    await this.sendCommand({ type: "prompt", message: text });
  }

  /** Send a raw command to pi RPC */
  private async sendCommand(cmd: Record<string, unknown>): Promise<void> {
    const line = JSON.stringify(cmd) + "\n";
    log.info(`[RPC SEND] ${line.trim()}`);
    this.process!.stdin!.write(line);
  }

  /** Handle stdout data from pi process */
  private handleStdout(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as PiRpcEvent;
        this.transformAndEmit(event);
      } catch (err) {
        log.warn(`Failed to parse RPC line: ${line.slice(0, 200)}`);
      }
    }
  }

  /** Transform Pi RPC event to Dashboard CE event */
  private transformAndEmit(event: PiRpcEvent): void {
    const sessionId = this.sessionId || "unknown";
    const timestamp = Date.now();

    switch (event.type) {
      case "session": {
        this.emit({
          type: "session:info",
          sessionId,
          timestamp,
          payload: { piSessionId: event.id, cwd: event.cwd, version: event.version },
        });
        break;
      }

      case "agent_start": {
        this.currentTurn = 0;
        this.emit({
          type: "agent:start",
          sessionId,
          timestamp,
          payload: {},
        });
        break;
      }

      case "agent_end": {
        this.emit({
          type: "agent:end",
          sessionId,
          timestamp,
          payload: { messages: event.messages },
        });
        break;
      }

      case "turn_start": {
        this.currentTurn++;
        this.emit({
          type: "agent:turn:start",
          sessionId,
          timestamp,
          payload: { turnIndex: this.currentTurn },
        });
        break;
      }

      case "turn_end": {
        this.emit({
          type: "agent:turn:end",
          sessionId,
          timestamp,
          payload: { message: event.message, toolResults: event.toolResults },
        });
        break;
      }

      case "message_start": {
        this.messageCounter++;
        this.currentMessageId = `msg_${this.messageCounter}`;
        this.emit({
          type: "chat:message:start",
          sessionId,
          timestamp,
          payload: { messageId: this.currentMessageId, message: event.message },
        });
        break;
      }

      case "message_update": {
        const ame = event.assistantMessageEvent;
        if (!ame) break;

        switch (ame.type) {
          case "text_delta": {
            // End reasoning if active
            if (this.currentReasoningId) {
              this.emit({
                type: "chat:reasoning:end",
                sessionId,
                timestamp,
                payload: { reasoningId: this.currentReasoningId },
              });
              this.currentReasoningId = null;
            }
            this.emit({
              type: "chat:text:delta",
              sessionId,
              timestamp,
              payload: { messageId: this.currentMessageId, delta: ame.delta },
            });
            break;
          }
          case "reasoning_delta": {
            if (!this.currentReasoningId) {
              this.currentReasoningId = `reasoning_${this.messageCounter}`;
              this.emit({
                type: "chat:reasoning:start",
                sessionId,
                timestamp,
                payload: { reasoningId: this.currentReasoningId },
              });
            }
            this.emit({
              type: "chat:reasoning:delta",
              sessionId,
              timestamp,
              payload: { reasoningId: this.currentReasoningId, delta: ame.delta },
            });
            break;
          }
        }
        break;
      }

      case "message_end": {
        if (this.currentReasoningId) {
          this.emit({
            type: "chat:reasoning:end",
            sessionId,
            timestamp,
            payload: { reasoningId: this.currentReasoningId },
          });
          this.currentReasoningId = null;
        }
        this.emit({
          type: "chat:message:end",
          sessionId,
          timestamp,
          payload: { messageId: this.currentMessageId, message: event.message },
        });
        this.currentMessageId = null;
        break;
      }

      case "tool_execution_start": {
        this.currentToolId = event.toolCallId;
        this.emit({
          type: "chat:tool:start",
          sessionId,
          timestamp,
          payload: {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
          },
        });
        break;
      }

      case "tool_execution_update": {
        this.emit({
          type: "chat:tool:update",
          sessionId,
          timestamp,
          payload: {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            partialResult: event.partialResult,
          },
        });
        break;
      }

      case "tool_execution_end": {
        this.emit({
          type: "chat:tool:end",
          sessionId,
          timestamp,
          payload: {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            result: event.result,
            isError: event.isError,
          },
        });
        if (this.currentToolId === event.toolCallId) {
          this.currentToolId = null;
        }
        break;
      }

      default:
        // Ignore other events (queue_update, compaction, retry, etc.)
        break;
    }
  }

  /** Emit a dashboard event */
  private emit(event: PiDashboardEvent): void {
    this.eventEmitter.emit("event", event);
  }

  /** Subscribe to dashboard events */
  onEvent(listener: (event: PiDashboardEvent) => void): () => void {
    this.eventEmitter.on("event", listener);
    return () => this.eventEmitter.off("event", listener);
  }

  /** Abort current operation */
  async abort(): Promise<void> {
    if (!this._isRunning || !this.process) return;
    await this.sendCommand({ type: "abort" });
  }
}

/** Factory function */
export function createPiAgentService(options?: PiAgentServiceOptions): PiAgentService {
  return new PiAgentService(options);
}
