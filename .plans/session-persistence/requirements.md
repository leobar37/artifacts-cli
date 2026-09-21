# Session Persistence Requirements

## Objective

Implement durable session persistence for the Artifact CLI chat system, enabling users to resume conversations across server restarts while maintaining integration with Claude Code's session resumption capabilities.

## Scope

- **In scope**:
  - File-based session storage system
  - Session store disk I/O operations
  - Session listing and retrieval API endpoints
  - Dashboard session reconnection via localStorage
  - Claude session validity handling
  - Context refresh on session resume

- **Out of scope**:
  - SQLite or database migration
  - Encryption of session data
  - Multi-user session sharing
  - Session migration from old in-memory system
  - Session import/export functionality

## Functional Requirements

- `FR-001` - Session data persists to disk when created or updated
- `FR-002` - Sessions load from disk on server startup
- `FR-003` - API endpoint exists to list resumable sessions for an artifact
- `FR-004` - Dashboard stores session ID in localStorage per artifact
- `FR-005` - Dashboard attempts to reconnect to existing session on load
- `FR-006` - Claude session resume is attempted when `claudeSessionId` exists
- `FR-007` - Graceful fallback to new Claude session when resume fails
- `FR-008` - System context refreshes from current artifact on session reconnect
- `FR-009` - Sessions can be explicitly deleted by user

## Non-Functional Requirements

- `NFR-001` - Persistence operations must not block the event loop (use async I/O)
- `NFR-002` - Storage format must be human-readable for debugging
- `NFR-003` - Session files must be isolated per project (project-scoped storage)
- `NFR-004` - Failed disk operations must not crash the server
- `NFR-005` - Session cleanup must handle orphaned files gracefully

## Acceptance Criteria

- User can start a chat session, restart the server, and resume the same conversation
- Session survives page refresh in the dashboard
- Expired Claude sessions are transparently replaced with new ones
- Context reflects current artifact state, not stale snapshot
- Server handles disk write failures gracefully with logged warnings

## Constraints

- Must work with existing `@anthropic-ai/claude-agent-sdk` version
- Must maintain backward compatibility with current API contract
- Storage directory must respect XDG Base Directory specification where applicable
- Single-file sessions preferred for easy inspection and cleanup

## Open Questions

- Should we implement session archival (moving old sessions to archive) or keep all history?
- What is the desired retention policy for orphaned session files?
- Should the dashboard show a "resume previous session" UI or auto-resume silently?
