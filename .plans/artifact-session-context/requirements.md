# Artifact Session Context Requirements

## Objective

Create a server-side session system where each artifact has an independent chat session that maintains artifact metadata (slug, path, type, content description) in the session context. The AI agent always knows the current artifact context without explicit user specification.

## Scope

### In scope
- Session creation, retrieval, and deletion endpoints
- Session store with in-memory persistence and TTL cleanup
- Content description generation for artifact HTML
- Agent context injection (system prompt enrichment)
- Frontend session lifecycle management
- Backward compatibility with existing chat API

### Out of scope
- Persistent storage (SQLite/Redis) - in-memory only for v1
- Multi-user session sharing
- Cross-device synchronization
- Session history persistence beyond server restart
- Session analytics or metrics

## Functional Requirements

- `FR-001` - Session Store: In-memory session store with create, get, update, delete operations
- `FR-002` - Session TTL: Automatic cleanup of sessions after 30 minutes of inactivity
- `FR-003` - Create Session API: `POST /api/chat/session` creates a new session for an artifact
- `FR-004` - Get Session API: `GET /api/chat/session/:id` returns session metadata and message history
- `FR-005` - Delete Session API: `DELETE /api/chat/session/:id` explicitly destroys a session
- `FR-006` - Modified Chat API: `POST /api/chat` accepts `sessionId` and uses session context
- `FR-007` - Content Description: Generate artifact content summary on session creation
- `FR-008` - System Prompt Injection: Agent system prompt includes artifact metadata from session
- `FR-009` - Frontend Session Init: Chat panel creates/retrieves session when artifact is selected
- `FR-010` - Session ID Header: Chat requests include session ID for context routing

## Non-Functional Requirements

- `NFR-001` - Memory Efficiency: Sessions store only essential metadata; message history uses AI SDK conventions
- `NFR-002` - Backward Compatibility: Existing API consumers should continue working (slug fallback)
- `NFR-003` - Token Optimization: Artifact description limited to 500 characters to minimize context window usage
- `NFR-004` - Clean Lifecycle: All resources cleaned up on session destroy or TTL expiration

## Acceptance Criteria

- User selects artifact → chat panel creates session → subsequent messages use that session
- User switches artifacts → new session created for new artifact
- User returns to previous artifact → session resumes with previous context
- Agent responds with awareness of current artifact (e.g., "I'll update the button styles in this artifact")
- Server restart clears all sessions (acceptable for v1)

## Constraints

- No persistent storage for v1 (in-memory only)
- Must integrate with existing `@ai-sdk/react` patterns
- Cannot break existing chat API contract without deprecation period
- Session ID must be opaque (UUID v4)

## Open Questions

- Should session history be truncated for very long conversations? (Recommend: implement if token costs become an issue)
- Do we need session listing endpoint (`GET /api/chat/sessions`) for debugging? (Recommend: add if needed during implementation)
