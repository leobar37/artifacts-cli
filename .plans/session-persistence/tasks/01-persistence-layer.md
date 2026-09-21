# T-001 Persistence Layer

## Objective

Create a file-based persistence interface and implementation for storing artifact sessions on disk.

## Requirements Covered

- `FR-001` - Session data persists to disk
- `NFR-001` - Async I/O operations
- `NFR-002` - Human-readable format
- `NFR-003` - Project-scoped storage
- `NFR-004` - Graceful failure handling

## Dependencies

- none

## Files or Areas Involved

- `src/server/session/persistence.ts` - Create - New persistence interface and implementation
- `src/server/session/types.ts` - Modify - Add persistence-related types
- `src/utils/project.ts` - Modify - Add project-specific storage path helper

## Actions

1. Define `SessionPersistence` interface with methods: `loadAll()`, `save()`, `delete()`, `loadById()`

2. Create `FileSystemPersistence` class implementing the interface:
   - Storage directory: `~/.artifact/sessions/<project-id>/`
   - File naming: `<session-id>.json`
   - JSON format with pretty printing for readability
   - Async file operations using `fs/promises`

3. Add error handling:
   - Wrap file operations in try/catch
   - Log warnings on failures without crashing server
   - Return empty array on load failures
   - Ensure directory exists before writes

4. Add project path helper:
   - Function to derive storage path from project ID
   - Reuse existing `getProjectId()` utility

5. Create unit tests for persistence layer:
   - Test save/load roundtrip
   - Test delete operation
   - Test error handling with invalid paths

## Completion Criteria

- `FileSystemPersistence` class exists with all interface methods implemented
- Sessions save as JSON files to disk successfully
- Load operations return parsed session objects
- File operations are async and non-blocking
- Errors are caught and logged without crashing

## Validation

- Unit tests pass: `npm test -- persistence`
- Manual test: Create session, verify file exists in `~/.artifact/sessions/`
- Error simulation: Test with read-only directory, verify graceful handling

## Risks or Notes

- File permissions: Ensure directory is user-readable only (0700)
- Concurrent writes: JSON format minimizes corruption risk; acceptable for single-user tool
- Storage growth: Files are small (~1KB), but many artifacts could accumulate files
