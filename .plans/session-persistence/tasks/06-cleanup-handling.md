# T-006 Cleanup Handling

## Objective

Implement cleanup handling for orphaned session files to prevent storage accumulation.

## Requirements Covered

- `NFR-005` - Session cleanup handles orphaned files gracefully

## Dependencies

- `T-001` (Persistence Layer)

## Files or Areas Involved

- `src/server/session/persistence.ts` - Modify - Add cleanup/validation methods
- `src/server/session/store.ts` - Modify - Add periodic cleanup or startup validation
- `src/cli/commands/start.ts` - Modify - Add cleanup option or automatic cleanup

## Actions

1. Add `validateSessions()` method to persistence layer:
   - Scan all session files in storage directory
   - Check if corresponding artifact still exists
   - Return list of orphaned session IDs (sessions for deleted artifacts)

2. Add `cleanupOrphaned()` method to persistence layer:
   - Accept list of orphaned session IDs
   - Delete corresponding JSON files
   - Return count of cleaned files

3. Add startup validation to SessionStore:
   - On load, check if artifact files still exist for each session
   - If artifact deleted, mark session as orphaned (don't load into memory)
   - Optionally: Delete orphaned session files immediately or keep for recovery

4. Add CLI command option:
   - `artifact start --cleanup-sessions` - Purge orphaned sessions before starting
   - Or automatic cleanup on every start (simpler)

5. Add session retention policy:
   - Configurable: Keep sessions for N days, then auto-delete
   - Default: No auto-deletion (user must manually delete)

6. Add session archival (optional):
   - Move old sessions to `~/.artifact/sessions/archive/` instead of deleting
   - Allows recovery if needed

## Completion Criteria

- Sessions for deleted artifacts are identified as orphaned
- Orphaned session files can be cleaned up
- Startup can optionally purge orphaned sessions
- Storage directory doesn't grow unbounded with stale sessions

## Validation

- Manual test:
  1. Create session for artifact
  2. Delete artifact directory
  3. Restart server with `--cleanup-sessions`
  4. Verify session file is removed

- Unit test:
  - Test `validateSessions()` identifies orphaned sessions
  - Test `cleanupOrphaned()` removes correct files

## Risks or Notes

- Accidental deletion: Ensure cleanup only removes sessions for truly deleted artifacts
- Recovery: Consider keeping orphaned sessions for 7 days before permanent deletion
- Performance: Scanning all session files on startup is O(n), acceptable for moderate n
- Cross-project: Ensure cleanup only affects current project's sessions
