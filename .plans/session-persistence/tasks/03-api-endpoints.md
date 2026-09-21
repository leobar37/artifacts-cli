# T-003 API Endpoints

## Objective

Add REST API endpoints for listing resumable sessions and explicit session resumption.

## Requirements Covered

- `FR-003` - API endpoint to list resumable sessions
- `FR-009` - Sessions can be explicitly deleted

## Dependencies

- `T-002` (Session Store Integration)

## Files or Areas Involved

- `src/server/routes/chat.ts` - Modify - Add new endpoints
- `src/server/session/store.ts` - Modify - Add `listBySlug()` method

## Actions

1. Add `listBySlug()` method to `SessionStore`:
   - Accept `slug: string` parameter
   - Return array of session metadata for that artifact
   - Sort by `lastActivity` descending (most recent first)

2. Add `GET /api/chat/sessions` endpoint:
   - Query parameter: `slug` (required)
   - Returns array of session metadata:
     ```json
     {
       "sessions": [
         {
           "id": "uuid",
           "slug": "artifact-slug",
           "createdAt": "ISO date",
           "lastActivity": "ISO date"
         }
       ]
     }
     ```
   - Returns 400 if slug missing
   - Returns empty array if no sessions found

3. Add `POST /api/chat/resume` endpoint:
   - Body: `{ "sessionId": "uuid", "slug": "artifact-slug" }`
   - Validates session exists
   - Updates `lastActivity` timestamp
   - Returns session data:
     ```json
     {
       "sessionId": "uuid",
       "slug": "artifact-slug",
       "resumed": true
     }
     ```
   - Returns 404 if session not found

4. Ensure existing endpoints work with persisted sessions:
   - Verify `GET /api/chat/session/:id` returns persisted sessions
   - Verify `DELETE /api/chat/session/:id` removes from disk

5. Add tests for new endpoints:
   - Test list endpoint with existing sessions
   - Test list endpoint with no sessions
   - Test resume endpoint
   - Test resume with invalid session ID

## Completion Criteria

- `GET /api/chat/sessions?slug=x` returns sessions for that artifact
- `POST /api/chat/resume` updates session activity and returns success
- Existing endpoints continue working with persisted sessions
- All new endpoints have error handling

## Validation

- API tests pass
- Manual test with curl:
  ```bash
  curl "http://localhost:6000/api/chat/sessions?slug=my-artifact"
  curl -X POST http://localhost:6000/api/chat/resume \
    -H "Content-Type: application/json" \
    -d '{"sessionId": "xxx", "slug": "my-artifact"}'
  ```

## Risks or Notes

- API naming: Ensure consistency with existing `/api/chat/session` endpoints
- Response format: Keep minimal to reduce payload size
- Security: No authentication needed for local CLI tool, but session IDs should be unguessable (already UUIDs)
