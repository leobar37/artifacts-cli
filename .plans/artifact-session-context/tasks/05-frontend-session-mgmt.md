# T-005 Frontend Session Management

## Objective

Update the frontend to create/retrieve sessions when artifacts are selected and pass session ID to chat requests.

## Requirements Covered

- `FR-009` - Frontend Session Init
- `FR-010` - Session ID Header

## Dependencies

- T-003 (API Contract - session endpoints exist)
- T-004 (Agent context injection - API returns proper responses)

## Files or Areas Involved

- `src/dashboard/hooks/useArtifactChat.ts` - Modify - Add session management
- `src/dashboard/components/ChatPanel.tsx` - Modify - Session initialization on artifact change
- `src/dashboard/hooks/useArtifactSession.ts` - Create - New hook for session lifecycle
- `src/dashboard/App.tsx` - Review - Check artifact selection flow

## Actions

1. **Create `src/dashboard/hooks/useArtifactSession.ts`**:
   ```typescript
   interface UseArtifactSessionOptions {
     slug: string | null;
   }
   
   export function useArtifactSession({ slug }: UseArtifactSessionOptions) {
     const [sessionId, setSessionId] = useState<string | null>(null);
     const [loading, setLoading] = useState(false);
     const [error, setError] = useState<string | null>(null);
     
     // Create session when slug changes
     useEffect(() => {
       if (!slug) {
         setSessionId(null);
         return;
       }
       
       setLoading(true);
       fetch('/api/chat/session', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ slug }),
       })
         .then(res => res.json())
         .then(({ sessionId }) => {
           setSessionId(sessionId);
           setError(null);
         })
         .catch(err => setError(err.message))
         .finally(() => setLoading(false));
     }, [slug]);
     
     return { sessionId, loading, error };
   }
   ```

2. **Modify `src/dashboard/hooks/useArtifactChat.ts`**:
   ```typescript
   export function useArtifactChat({ sessionId, slug }: UseArtifactChatOptions) {
     const chat = useChat({
       transport: new DefaultChatTransport({
         api: '/api/chat',
         body: {
           sessionId,  // Include session ID
           // Keep slug for backward compatibility (optional)
         },
       }),
     });
     
     return chat;
   }
   ```

3. **Modify `src/dashboard/components/ChatPanel.tsx`**:
   - Import and use `useArtifactSession` hook
   - Pass session ID to `useArtifactChat`
   - Show loading state during session creation
   - Handle session creation errors gracefully

4. **Update artifact selection flow in `App.tsx`**:
   - When `selectedArtifact` changes, ChatPanel will auto-create new session
   - No changes needed if ChatPanel handles it internally

## Completion Criteria

- Selecting an artifact creates a session automatically
- Session ID is included in chat requests
- Chat panel shows loading state during session creation
- Switching artifacts creates a new session
- Returning to previous artifact may resume session (if not expired)

## Validation

- Manual test: select artifact, open chat, verify session ID in network requests
- Manual test: switch between artifacts, verify different session IDs
- Manual test: refresh page, verify session is lost (expected for v1)

## Risks or Notes

- Session creation is async; brief loading state will appear
- If session expires (TTL), next chat message will get 404 - need error handling
- Consider caching session ID in component state vs localStorage
- Multiple ChatPanel instances would create multiple sessions (not expected in current UI)
