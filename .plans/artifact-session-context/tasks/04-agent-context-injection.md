# T-004 Agent Context Injection

## Objective

Refactor the ArtifactAgent to accept session context and inject artifact metadata into the system prompt.

## Requirements Covered

- `FR-008` - System Prompt Injection

## Dependencies

- T-001 (Session Store types)
- T-003 (API Contract - agent will be called with session context)

## Files or Areas Involved

- `src/server/agents/artifact-agent.ts` - Modify - Refactor chat method, add chatWithSession
- `src/types/artifact.ts` - Review - Check existing types

## Actions

1. **Modify `ArtifactAgent` class in `src/server/agents/artifact-agent.ts`**:

   Add new method `chatWithSession`:
   ```typescript
   async chatWithSession(
     session: ArtifactSession,
     messages: UIMessage[]
   ): Promise<Response> {
     const systemPrompt = this.buildSystemPrompt(session);
     const convertedMessages = await convertToModelMessages(messages);
     
     const result = streamText({
       model: anthropic(this.modelName),
       system: systemPrompt,
       messages: convertedMessages,
       tools: this.buildTools(session), // Tools now use session context
       stopWhen: stepCountIs(this.maxSteps),
     });
     
     return result.toUIMessageStreamResponse();
   }
   ```

   Add `buildSystemPrompt` private method:
   ```typescript
   private buildSystemPrompt(session: ArtifactSession): string {
     return `You are editing artifact: ${session.slug}
   Path: ${session.path}
   Type: ${session.type}
   Content Summary: ${session.description || 'No description available'}
   
   You help users understand, modify, and create HTML artifacts.
   Use "read-artifact" to inspect current artifact content.
   Use "delegate-to-claude-code" to make actual file changes.
   Use "list-artifacts" to discover available artifacts.
   Always describe what you changed after making modifications.`;
   }
   ```

   Update `buildTools` to accept `session` parameter:
   ```typescript
   private buildTools(session: ArtifactSession) {
     // Tools now use session.slug, session.path, session.artifactType
     // instead of receiving them per-call
   }
   ```

2. **Update tool implementations**:
   - `read-artifact`: Uses `session.slug` as default if no slug provided
   - `delegate-to-claude-code`: Uses `session.slug`, `session.path`, `session.type`
   - Tools become simpler since they have session context baked in

3. **Keep legacy `chat` method for backward compatibility**:
   - `chat(request)` calls `chatWithSession` after loading/creating session
   - Existing tests continue to work

## Completion Criteria

- Agent system prompt includes artifact metadata from session
- Tools have access to session context without explicit parameters
- Backward compatible with existing `chat()` calls
- Session context is used for all tool executions

## Validation

- Unit test: verify system prompt contains session metadata
- Unit test: verify tools use session context (not request parameters)
- Integration test: full chat flow with session context

## Risks or Notes

- System prompt length increases with description (capped at 500 chars in T-002)
- Tool parameter changes are backward compatible (optional params with defaults)
- Consider making session context immutable during a session (don't allow changing slug mid-session)
