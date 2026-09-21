# T-004 Dashboard Storage

## Objective

Implement localStorage-based session tracking in the dashboard to enable reconnection to previous sessions.

## Requirements Covered

- `FR-004` - Dashboard stores session ID in localStorage per artifact
- `FR-005` - Dashboard attempts to reconnect to existing session on load

## Dependencies

- `T-003` (API Endpoints for listing/resuming sessions)

## Files or Areas Involved

- `src/dashboard/hooks/useArtifactSession.ts` - Modify - Add localStorage integration
- `src/dashboard/hooks/useSelectedArtifact.ts` - Review - May need to pass session info
- `src/dashboard/components/ChatPanel.tsx` - Modify - Add session resume UI

## Actions

1. Define localStorage key format:
   - Key: `artifact-session:<project-path-hash>:<slug>`
   - Value: `sessionId` string
   - Use project path hash to avoid collisions between projects

2. Modify `useArtifactSession` hook:
   - Add `localStorage.getItem()` call on mount to check for existing session
   - Add helper function `getStoredSessionId(slug): string | null`
   - If stored session exists, call `GET /api/chat/sessions?slug=x` to verify validity
   - If valid, use existing session; if invalid, clear storage and create new

3. Add session storage on successful creation:
   - When `createSession()` succeeds, store `sessionId` in localStorage

4. Add session clearing on explicit close/delete:
   - When user closes chat or session is deleted, remove from localStorage

5. Add session resume UI to ChatPanel:
   - When no session exists but localStorage has one, show "Resume previous session" button
   - When session exists, show session ID (first 8 chars) and "New session" option

6. Handle storage quota exceeded:
   - Wrap localStorage operations in try/catch
   - Log warning if storage fails, don't crash UI

7. Add storage event listener:
   - Listen for `storage` events to sync across tabs (optional enhancement)

## Completion Criteria

- Session ID stored in localStorage when created
- Session ID retrieved from localStorage on component mount
- Validity check against server before using stored session
- "Resume previous session" UI appears when applicable
- Graceful handling when stored session no longer exists

## Validation

- Manual test:
  1. Open dashboard, select artifact, open chat
  2. Verify localStorage has `artifact-session:*` key
  3. Refresh page, verify chat reconnects to same session
  4. Restart server, refresh page, verify session still reconnects

- Error test:
  1. Manually corrupt localStorage value
  2. Verify dashboard handles gracefully and creates new session

## Risks or Notes

- Project path changes: If project moves, localStorage key changes (session appears lost)
  - Mitigation: Use project ID hash that's consistent regardless of path
- Storage limits: localStorage is ~5MB, session IDs are small
- Privacy: Session IDs stored in plain text (acceptable for local development tool)
