# T-003 API Contract - Session Endpoints

## Objective

Add new API endpoints for session lifecycle management and modify the existing chat endpoint to accept session ID.

## Requirements Covered

- `FR-003` - Create Session API
- `FR-004` - Get Session API
- `FR-005` - Delete Session API
- `FR-006` - Modified Chat API

## Dependencies

- T-001 (Session Store)
- T-002 (Content Description)

## Files or Areas Involved

- `src/server/routes/chat.ts` - Modify - Add new endpoints, modify existing handler
- `src/server/index.ts` - Review - Route registration unchanged
- `src/dashboard/hooks/useArtifactChat.ts` - Review - Will need updates in T-005

## Actions

1. **Modify `src/server/routes/chat.ts`**:

   Add `POST /session` endpoint:
   ```typescript
   router.post('/session', async (c) => {
     // 1. Parse { slug } from body
     // 2. Get artifact path from slug (reuse existing logic)
     // 3. Generate description via describeArtifact()
     // 4. Build systemContext string with metadata
     // 5. Create session in sessionStore
     // 6. Return { sessionId, slug, createdAt }
   });
   ```

   Add `GET /session/:id` endpoint:
   ```typescript
   router.get('/session/:id', async (c) => {
     // 1. Get sessionId from params
     // 2. Retrieve from sessionStore
     // 3. Return session data (metadata only, not full messages)
   });
   ```

   Add `DELETE /session/:id` endpoint:
   ```typescript
   router.delete('/session/:id', async (c) => {
     // 1. Get sessionId from params
     // 2. Delete from sessionStore
     // 3. Return 204 No Content
   });
   ```

   Modify existing `POST /` (chat):
   ```typescript
   router.post('/', async (c) => {
     const { sessionId, messages, slug } = await c.req.json();
     
     // BACKWARD COMPATIBILITY: If sessionId provided, use session context
     // If only slug provided (old clients), create implicit session
     // This ensures existing API consumers continue working
     
     const session = sessionId 
       ? sessionStore.get(sessionId)
       : await createImplicitSession(slug);
     
     if (!session) {
       return c.json({ error: 'Session not found' }, 404);
     }
     
     return agent.chatWithSession(session, messages);
   });
   ```

2. **Add helper function**:
   - `createImplicitSession(slug)` - Creates session on-the-fly for backward compatibility

3. **Ensure imports**:
   - Import `sessionStore` from session module
   - Import `describeArtifact` from utils

## Completion Criteria

- `POST /api/chat/session` creates a new session with metadata
- `GET /api/chat/session/:id` returns session metadata
- `DELETE /api/chat/session/:id` destroys a session
- `POST /api/chat` works with both `sessionId` and legacy `slug` parameter
- Backward compatibility: existing API calls continue working

## Validation

- API integration tests for all new endpoints
- Test backward compatibility path (slug without sessionId)
- Test 404 response for non-existent session

## Risks or Notes

- Session creation on every legacy request (without sessionId) may increase memory usage
- Consider rate limiting session creation to prevent abuse
- The implicit session pattern is a temporary bridge; may deprecate in future
