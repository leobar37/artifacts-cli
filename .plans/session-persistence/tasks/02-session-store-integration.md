# T-002 Session Store Integration

## Objective

Integrate the persistence layer into `SessionStore` to load sessions on startup and save on changes.

## Requirements Covered

- `FR-001` - Session data persists to disk when created or updated
- `FR-002` - Sessions load from disk on server startup
- `FR-008` - System context refreshes from current artifact

## Dependencies

- `T-001` (Persistence Layer must be complete)

## Files or Areas Involved

- `src/server/session/store.ts` - Modify - Add persistence integration
- `src/server/session/index.ts` - Modify - Export persistence interface
- `src/server/index.ts` - Modify - Initialize store with persistence on startup

## Actions

1. Modify `SessionStore` constructor:
   - Accept optional `persistence: SessionPersistence` parameter
   - Call `this.loadFromDisk()` if persistence provided

2. Implement `loadFromDisk()` method:
   - Call `persistence.loadAll()` on startup
   - Rebuild `sessions` Map and `slugIndex` Map from loaded data
   - Log count of restored sessions on startup
   - Refresh `systemContext` for each loaded session from current artifact

3. Modify `create()` method:
   - After creating session, call `persistence.save(session)` if available
   - Handle save errors gracefully (log warning, don't fail creation)

4. Modify `updateClaudeSessionId()` method:
   - After updating, call `persistence.save(session)` to persist the ID

5. Modify `updateDescription()` method:
   - After updating context, call `persistence.save(session)`

6. Modify `delete()` method:
   - Call `persistence.delete(id)` before removing from memory

7. Add `dispose()` persistence cleanup:
   - Ensure all pending saves complete before shutdown (if needed)

8. Update server startup:
   - In `src/server/index.ts`, create `FileSystemPersistence` instance
   - Pass to `SessionStore` constructor or use singleton pattern

## Completion Criteria

- `SessionStore` accepts and uses persistence layer
- Sessions load from disk on server startup
- Session creation triggers disk save
- Session updates trigger disk save
- Session deletion removes from disk
- System context is refreshed from current artifact on load

## Validation

- Integration test: Start server with existing sessions, verify they appear
- Manual test: Create session, stop server, restart, verify session exists
- TypeScript check: `npm run typecheck` passes

## Risks or Notes

- Context refresh: The loaded session's `systemContext` may be stale if artifact changed
  - Mitigation: Rebuild `systemContext` from current artifact on load
  - Alternative: Store artifact hash and warn if changed
- Claude session IDs: May be expired when loaded; handled in T-005
- Race conditions: Save operations could overlap; acceptable risk for single-user tool
