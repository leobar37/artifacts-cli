import { Hono } from "hono";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { streamSSE } from "hono/streaming";
import { PiAgentService, createPiAgentService } from "../agents/pi-agent-service.js";
import { piEventBus } from "../agents/pi-event-bus.js";
import { getSessionStore } from "../session/index.js";
import type { ArtifactSession } from "../session/types.js";
import { describeArtifact } from "../../utils/artifact-describer.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("chat-pi");

function resolveArtifactPath(
  artifactsPath: string,
  slug: string,
): { path: string; format: "html" | "tsx" } {
  const tsxPath = join(artifactsPath, slug, "content.tsx");
  const htmlPath = join(artifactsPath, slug, "index.html");
  if (existsSync(tsxPath)) {
    return { path: tsxPath, format: "tsx" };
  }
  return { path: htmlPath, format: "html" };
}

const projectPath = process.env.ARTIFACT_PROJECT_PATH || process.cwd();
const sessionStore = getSessionStore();

// Map of active PiAgentService instances by artifact session ID
const activeAgents = new Map<string, PiAgentService>();

const router = new Hono();

/** Get or create a PiAgentService for a session */
async function getOrCreateAgent(session: ArtifactSession): Promise<PiAgentService> {
  let agent = activeAgents.get(session.id);
  if (!agent || !agent.isRunning) {
    // Clean up old agent if exists
    if (agent) {
      try { await agent.stop(); } catch { /* ignore */ }
    }

    agent = createPiAgentService({
      cwd: projectPath,
      model: session.model || undefined,
      maxSteps: 10,
    });

    await agent.start();
    activeAgents.set(session.id, agent);
    log.info(`Created PiAgentService for session ${session.id.slice(0, 8)}...`);

    // Wire events to the event bus
    agent.onEvent((event) => {
      piEventBus.publish(session.id, event);
    });
  }
  return agent;
}

router.post("/session", async (c) => {
  const body = await c.req.json();
  const { slug } = body;

  if (!slug || typeof slug !== "string") {
    return c.json({ error: "slug is required" }, 400);
  }

  const artifactsPath = process.env.ARTIFACT_ARTIFACTS_PATH || "./docs/artifacts";
  const { path: artifactPath } = resolveArtifactPath(artifactsPath, slug);

  const description = await describeArtifact(projectPath, slug);
  let fullContent: string | undefined;
  try {
    fullContent = readFileSync(artifactPath, "utf-8");
  } catch {
    // fallback to description only
  }

  const session = await sessionStore.create(
    slug,
    artifactPath,
    "generic",
    description,
    fullContent,
  );

  return c.json({
    sessionId: session.id,
    slug: session.slug,
    model: session.model,
    createdAt: new Date(session.createdAt).toISOString(),
  });
});

router.get("/session/:id", async (c) => {
  const sessionId = c.req.param("id");
  const metadata = sessionStore.getMetadata(sessionId);

  if (!metadata) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.json({
    id: metadata.id,
    slug: metadata.slug,
    path: metadata.path,
    type: metadata.type,
    model: metadata.model,
    createdAt: new Date(metadata.createdAt).toISOString(),
    lastActivity: new Date(metadata.lastActivity).toISOString(),
  });
});

router.delete("/session/:id", async (c) => {
  const sessionId = c.req.param("id");

  // Clean up agent if active
  const agent = activeAgents.get(sessionId);
  if (agent) {
    try { await agent.stop(); } catch { /* ignore */ }
    activeAgents.delete(sessionId);
  }

  const deleted = await sessionStore.delete(sessionId);
  if (!deleted) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.body(null, 204);
});

router.get("/sessions", async (c) => {
  const slug = c.req.query("slug");
  if (!slug || typeof slug !== "string") {
    return c.json({ error: "slug query parameter is required" }, 400);
  }

  const sessions = sessionStore.listBySlug(slug);
  return c.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      slug: session.slug,
      model: session.model,
      createdAt: new Date(session.createdAt).toISOString(),
      lastActivity: new Date(session.lastActivity).toISOString(),
    })),
  });
});

// Resume an existing session
router.post("/resume", async (c) => {
  const body = await c.req.json();
  const { sessionId, slug } = body;

  if (!sessionId || typeof sessionId !== "string") {
    return c.json({ error: "sessionId is required" }, 400);
  }
  if (!slug || typeof slug !== "string") {
    return c.json({ error: "slug is required" }, 400);
  }

  const session = sessionStore.get(sessionId);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  if (session.slug !== slug) {
    return c.json({ error: "Session does not match slug" }, 400);
  }

  session.lastActivity = Date.now();

  return c.json({
    sessionId: session.id,
    slug: session.slug,
    model: session.model,
    resumed: true,
    lastActivity: new Date(session.lastActivity).toISOString(),
    messages: session.messages || [],
  });
});

// SSE endpoint for session-specific events
router.get("/events/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");

  return streamSSE(c, async (stream) => {
    log.info(`SSE client connected for session ${sessionId.slice(0, 8)}...`);

    // Send initial connection event
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({ sessionId, connectedAt: new Date().toISOString() }),
    });

    // Subscribe to events for this session
    const unsubscribe = piEventBus.subscribe(sessionId, async (event) => {
      try {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event.payload),
        });
      } catch (err) {
        log.warn(`Failed to write SSE for session ${sessionId.slice(0, 8)}...: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    stream.onAbort(() => {
      unsubscribe();
      log.info(`SSE client disconnected for session ${sessionId.slice(0, 8)}...`);
    });

    // Keep alive
    await new Promise(() => {});
  });
});

// Main chat endpoint - returns streaming response compatible with AI SDK
router.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { sessionId, messages, slug, model } = body;

    log.info(`Chat request: sessionId=${sessionId?.slice(0, 8)}..., slug=${slug}, model=${model}`);

    if (!messages || !Array.isArray(messages)) {
      return c.json({ error: "messages array is required" }, 400);
    }

    // Get or create session
    let session: ArtifactSession | null = null;
    if (sessionId) {
      session = sessionStore.get(sessionId);
      if (!session) {
        return c.json({ error: "Session not found" }, 404);
      }
    } else if (slug) {
      session = sessionStore.getBySlug(slug);
      if (!session) {
        session = await createImplicitSession(slug);
      }
    } else {
      return c.json({ error: "Either sessionId or slug is required" }, 400);
    }

    if (!session) {
      return c.json({ error: "Failed to create or find session" }, 500);
    }

    // Update model if specified
    if (model) {
      await sessionStore.updateModel(session.id, model);
      session.model = model;
    }

    // Refresh system context
    await sessionStore.refreshSystemContext(session.id);

    // Get the last user message
    const lastUserMessage = extractLastUserMessage(messages);
    if (!lastUserMessage) {
      return c.json({ error: "No user message found" }, 400);
    }

    // Get or create PiAgentService
    const agent = await getOrCreateAgent(session);

    // Persist messages
    const normalized = normalizeMessages(messages);
    await sessionStore.updateMessages(session.id, normalized as any);

    // Send prompt to Pi agent
    await agent.prompt(lastUserMessage, session);

    // Return a streaming response that the frontend can consume
    // For now, return a simple JSON response indicating success
    // The frontend should connect to SSE for actual events
    return c.json({
      success: true,
      sessionId: session.id,
      message: "Prompt sent. Connect to SSE for streaming events.",
    });

  } catch (error) {
    log.error(`Error in chat route: ${error instanceof Error ? error.message : String(error)}`);
    return c.json({ error: "Internal server error" }, 500);
  }
});

function extractLastUserMessage(messages: unknown[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg || typeof msg !== "object") continue;
    const role = (msg as { role?: unknown }).role;
    if (role === "user") {
      return extractMessageText(msg as { content?: unknown; parts?: Array<{ type?: unknown; text?: unknown }> });
    }
  }
  return null;
}

function extractMessageText(message: {
  content?: unknown;
  parts?: Array<{ type?: unknown; text?: unknown }>;
}): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => String(part.text).trim())
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

function normalizeMessages(messages: unknown[]): Array<{ id: string; role: "user" | "assistant"; parts: Array<{ type: string; text: string }> }> {
  return messages.flatMap((message) => {
    if (!message || typeof message !== "object") return [];
    const role = (message as { role?: unknown }).role;
    if (role !== "user" && role !== "assistant") return [];
    const text = extractMessageText(message as { content?: unknown; parts?: Array<{ type?: unknown; text?: unknown }> });
    if (!text) return [];
    return [{
      id: typeof (message as { id?: unknown }).id === "string" ? (message as { id: string }).id : crypto.randomUUID(),
      role: role as "user" | "assistant",
      parts: [{ type: "text", text }],
    }];
  });
}

async function createImplicitSession(slug: string) {
  const artifactsPath = process.env.ARTIFACT_ARTIFACTS_PATH || "./docs/artifacts";
  const { path: artifactPath } = resolveArtifactPath(artifactsPath, slug);
  const description = await describeArtifact(projectPath, slug);
  let fullContent: string | undefined;
  try {
    fullContent = readFileSync(artifactPath, "utf-8");
  } catch {
    // fallback
  }
  return sessionStore.create(slug, artifactPath, "generic", description, fullContent);
}

export default router;
