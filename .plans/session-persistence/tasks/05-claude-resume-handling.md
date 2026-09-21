# T-005 Claude Resume Handling

## Objective

Implement error handling for Claude Code session resumption with graceful fallback to new sessions when resume fails.

## Requirements Covered

- `FR-006` - Claude session resume attempted when `claudeSessionId` exists
- `FR-007` - Graceful fallback to new Claude session when resume fails

## Dependencies

- `T-002` (Session Store Integration - for accessing `claudeSessionId`)

## Files or Areas Involved

- `src/server/agents/claude-code-executor.ts` - Modify - Add resume error handling
- `src/server/agents/artifact-agent.ts` - Modify - Handle resume failures in `chatWithSession`

## Actions

1. Modify `ClaudeCodeExecutor.execute()` method:
   - Current: passes `resume` parameter if session exists
   - Add try/catch around the `query()` call
   - On resume failure (specific error), clear stored session and retry without `resume`

2. Identify Claude resume error patterns:
   - Check Claude SDK documentation for resume failure error types
   - Common errors: "session expired", "session not found", "invalid session"
   - Log resume attempt and failure for debugging

3. Implement fallback logic:
   - If resume fails with session-related error:
     1. Log warning: "Claude session expired, creating new session"
     2. Clear `claudeSessionId` from session store (set to undefined)
     3. Retry `query()` without `resume` parameter
     4. Store new `claudeSessionId` from successful response

4. Modify `ArtifactAgent.chatWithSession()`:
   - Add `onError` callback or try/catch in stream processing
   - If error is resume-related, emit event to client
   - Client can show "Starting fresh session" notification

5. Add resume metrics/logging:
   - Track resume success/failure rates
   - Log how often Claude sessions expire

6. Add configuration for resume behavior:
   - Option to disable resume attempts (always fresh sessions)
   - Configurable retry count for resume failures

## Completion Criteria

- Resume failures are caught and handled gracefully
- New Claude session created transparently when resume fails
- Client receives notification when fallback occurs
- Session store updated with new `claudeSessionId`
- No user-visible errors for expired Claude sessions

## Validation

- Integration test: Simulate resume failure, verify fallback works
- Manual test:
  1. Create session, note `claudeSessionId`
  2. Wait for Claude session to expire (or manually corrupt ID)
  3. Send chat message, verify it works with new session
  4. Check logs show resume failure and fallback

## Risks or Notes

- Claude SDK error types: May need to inspect actual error messages to identify resume failures
- Infinite loop risk: Ensure fallback only happens once per request
- State loss: Conversation context with Claude is lost on resume failure (unavoidable)
- Cost: New Claude session may re-process context, incurring additional tokens
