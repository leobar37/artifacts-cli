# AGENTS.md — @tarileo/artifact-omp

Scope: `packages/pi-extension/` only. Root repo conventions still apply (Bun only, no `npm publish` by hand).

## Structure

- `src/index.ts` — extension entry: default export `(pi) => void` registering 6 tools + `/artifact` command + `artifacts://` protocol.
- `src/dashboard.ts` — dashboard-link resolution: `slugify`, `getProjectId` (mirrors CLI sha256-of-canonical-dir), `readDaemon` (read-only `daemon.json`), `buildLinks` (pure URL builder), `probeDaemon` (`/api/health`), `resolveDashboard` (lock + probe), `viewLine` (optimistic link for writes). Never throws.
- `src/omp-router.d.ts` — type shim for omp's internal router (`@oh-my-pi/pi-coding-agent/src/internal-urls/router`). Real import is lazy in `try/catch`.
- `src/__tests__/protocol.test.ts` — protocol handler tests; `src/__tests__/dashboard.test.ts` — links/lock/probe tests (exported only for tests via `artifactsProtocolHandler`).
- `dist/` — build output (`tsc -p tsconfig.json`), the only thing published (`files: ["dist/"]`). Entry declared in `package.json` via `"omp": { "extensions": ["./dist/index.js"] }`.
## Rules

1. **Content tools never need the daemon.** `create/read/update/versions/list` use `new LocalStore()` directly. Only link resolution reads `~/.artifact/daemon.json` (read-only, respects `ARTIFACT_DIR`) and probes `/api/health` — and it never fails a write (`viewLine` returns `""` → caller prints the hint).
2. **Never import `src/utils/*`.** `dashboard.ts` re-implements the two things it needs (`getProjectId`, daemon-lock read) so the extension stays dependency-light. If the CLI changes its project-id scheme or lock path, update the mirror + its test.
3. **Error contract is API.** Keep the exact prefixes agents parse: `OK <slug>@<version>`, `NOT_FOUND <slug>`, `CONFLICT <slug>: latest is <v>, base was <v>`, `NO_DAEMON ... Start with: artifact start`. Changing them breaks agent prompts. `artifact_show`/`view:` are the ONLY place agents get URLs — `artifact_read` is for editing, never for presenting.
4. **Protocol is best-effort.** `tryRegisterArtifactsProtocol()` must stay in `try/catch` — if omp moves the internal router path, the extension still loads and tools keep working. Reads are immutable; writes go only through tools.
5. **Strings in English.** v0.1.2 shipped Spanish strings; current source is English. Keep it that way.
6. **Pi interface is minimal on purpose.** The local `Pi`/`ToolContext` types mirror only what we use (`setLabel`, `on(session_start)`, `registerTool`, `registerCommand`). Extend only when omp actually provides the method.
7. **No new deps without reason.** Runtime deps are `zod` + `@tarileo/artifact-store`. `devDeps` (`typescript`, `@oh-my-pi/pi-coding-agent`) are types/build only.

## Workflow

```bash
bun run --cwd packages/store build       # if store changed, rebuild first
bun run --cwd packages/pi-extension build
bun run --cwd packages/pi-extension typecheck
bunx vitest run packages/pi-extension
```

- Full typecheck also covers this package via root `tsc` only for dashboard/node; always run the package `typecheck` explicitly.
- Smoke before release: `omp plugin link ./packages/pi-extension`, start a pi session, `artifact_create` → check `docs/artifacts/<slug>/` + dashboard, then `omp plugin remove`.
- Release: bump `version` → commit → tag `omp-v<ver>` → GitHub Release (workflow publishes). Verify with `npm view @tarileo/artifact-omp --prefer-online` (plain `npm view` lies via cache).
