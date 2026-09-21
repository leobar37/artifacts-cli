# T-001 Session Store Foundation

## Objective

Create the in-memory session store module with CRUD operations, TTL cleanup, and type definitions for artifact sessions.

## Requirements Covered

- `FR-001` - Session Store
- `FR-002` - Session TTL

## Dependencies

None (foundation layer)

## Files or Areas Involved

- `src/server/session/store.ts` - Create - Core session store implementation
- `src/server/session/types.ts` - Create - TypeScript interfaces for session data
- `src/server/session/index.ts` - Create - Module exports

## Actions

1. Create `src/server/session/types.ts` with:
   - `ArtifactSession` interface (id, slug, path, type, description, systemContext, createdAt, lastActivity)
   - `SessionStoreOptions` interface for configuration

2. Create `src/server/session/store.ts` implementing:
   - `SessionStore` class with in-memory `Map<string, ArtifactSession>`
   - `create(slug, path, type, description)` method - generates UUID, sets timestamps, stores session
   - `get(id)` method - returns session or null, updates lastActivity
   - `updateDescription(id, description)` method - updates content description
   - `delete(id)` method - removes session from store
   - `list()` method - returns all sessions (for debugging)
   - `cleanup()` private method - removes sessions with lastActivity > TTL (30 min)
   - TTL cleanup interval (runs every 5 minutes)

3. Create `src/server/session/index.ts` exporting:
   - `SessionStore` class
   - `ArtifactSession` type
   - Singleton instance `sessionStore`

## Completion Criteria

- SessionStore can create, retrieve, update, and delete sessions
- Sessions are automatically cleaned up after 30 minutes of inactivity
- TypeScript types are properly exported for use by other modules

## Validation

- Unit tests for create, get, delete operations
- Unit tests for TTL cleanup behavior
- TypeScript compilation passes without errors

## Risks or Notes

- In-memory storage means sessions are lost on server restart
- Concurrent access is single-threaded (Node.js event loop), no race conditions expected
- TTL cleanup runs on interval; sessions may persist slightly beyond TTL (up to 5 minutes)
