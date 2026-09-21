# T-002 Content Description Generator

## Objective

Create a utility that reads an artifact's HTML file and generates a brief content description for session context injection.

## Requirements Covered

- `FR-007` - Content Description

## Dependencies

None (standalone utility)

## Files or Areas Involved

- `src/utils/artifact-describer.ts` - Create - Content description generation utility
- `src/utils/scanner.ts` - Review - Reference existing artifact reading patterns

## Actions

1. Create `src/utils/artifact-describer.ts` implementing:
   - `describeArtifact(projectPath: string, slug: string): Promise<string>` function
   - Read artifact HTML file from `docs/artifacts/{slug}/index.html`
   - Extract text content (strip HTML tags)
   - Truncate to 500 characters maximum
   - If file read fails, return empty string (graceful degradation)

2. Implementation should:
   - Use `fs/promises` for async file I/O
   - Strip HTML using regex or simple parser (no heavy dependency)
   - Normalize whitespace for cleaner description
   - Handle encoding (UTF-8 assumed)

3. Add unit tests:
   - Successful description extraction
   - HTML tag stripping
   - Truncation at 500 chars
   - Graceful handling of missing files

## Completion Criteria

- `describeArtifact()` returns a text summary of the artifact HTML
- Description is capped at 500 characters
- Missing files return empty string, not an error
- No new external dependencies added

## Validation

- Unit tests covering edge cases (empty file, very long content, missing file)
- Manual test: run function on an existing artifact in `docs/artifacts/`

## Risks or Notes

- For very large HTML files, reading and parsing may be slow (mitigate with truncation)
- HTML parsing with regex is fragile for complex HTML but sufficient for simple artifacts
- Consider caching descriptions if performance becomes an issue (not in v1 scope)
