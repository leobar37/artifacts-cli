# Session Persistence Task Index

## Summary

- Mode: Structured
- Slug: `session-persistence`
- Requirements File: `requirements.md`
- Checklist File: `checklist.json`

## Requirements Coverage

| Requirement | Covered By |
|-------------|------------|
| `FR-001` | `tasks/01-persistence-layer.md` |
| `FR-002` | `tasks/01-persistence-layer.md`, `tasks/02-session-store-integration.md` |
| `FR-003` | `tasks/03-api-endpoints.md` |
| `FR-004` | `tasks/04-dashboard-storage.md` |
| `FR-005` | `tasks/04-dashboard-storage.md` |
| `FR-006` | `tasks/05-claude-resume-handling.md` |
| `FR-007` | `tasks/05-claude-resume-handling.md` |
| `FR-008` | `tasks/02-session-store-integration.md` |
| `FR-009` | `tasks/03-api-endpoints.md` |
| `NFR-001` | `tasks/01-persistence-layer.md` |
| `NFR-002` | `tasks/01-persistence-layer.md` |
| `NFR-003` | `tasks/01-persistence-layer.md` |
| `NFR-004` | `tasks/01-persistence-layer.md` |
| `NFR-005` | `tasks/06-cleanup-handling.md` |

## Task List

| Task ID | File | Purpose | Dependencies |
|---------|------|---------|--------------|
| `T-001` | `tasks/01-persistence-layer.md` | Create file-based persistence interface and implementation | none |
| `T-002` | `tasks/02-session-store-integration.md` | Integrate persistence into SessionStore with load/save | `T-001` |
| `T-003` | `tasks/03-api-endpoints.md` | Add session listing and resumption endpoints | `T-002` |
| `T-004` | `tasks/04-dashboard-storage.md` | Implement localStorage session tracking in dashboard | `T-003` |
| `T-005` | `tasks/05-claude-resume-handling.md` | Handle Claude session resume with fallback logic | `T-002` |
| `T-006` | `tasks/06-cleanup-handling.md` | Implement orphaned session cleanup | `T-001` |

## Suggested Execution Order

1. **T-001 (Persistence Layer)** - Foundation: storage directory, interface, JSON I/O
2. **T-002 (Session Store Integration)** - Core: load on startup, save on changes
3. **T-003 (API Endpoints)** - Surface: enable client to discover and resume sessions
4. **T-005 (Claude Resume Handling)** - Robustness: handle SDK resume failures
5. **T-004 (Dashboard Storage)** - Client: localStorage integration and reconnection
6. **T-006 (Cleanup Handling)** - Polish: handle orphaned files gracefully

## Notes

- Tasks T-003 and T-005 can be parallelized after T-002 completes
- T-004 depends on T-003 because the dashboard needs the list/resume API
- T-006 can be done anytime after T-001 but is ordered last as it's polish
- Consider adding integration tests after all tasks complete
