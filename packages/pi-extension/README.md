# @tarileo/artifact-omp

Pi/omp extension for `artifact-cli`: lets coding agents create, read, update, and list HTML artifacts without hand-writing `docs/artifacts/`.

> Toolchain: **[Bun](https://bun.sh) only**. No npm/pnpm/yarn.

## Install

From npm (any pi session for that user):

```bash
omp plugin install @tarileo/artifact-omp
```

From source:

```bash
git clone https://github.com/leobar37/artifacts-cli.git
cd artifacts-cli
bun install
bun run --cwd packages/store build
bun run --cwd packages/pi-extension build
omp plugin link ./packages/pi-extension
```
Uninstall (verifies rollback path):

```bash
omp plugin remove @tarileo/artifact-omp
# if that flag doesn't exist in your omp version: omp plugin --help
```

## What the agent gets
| Tool | Purpose |
|---|---|
| `artifact_create` | Save standalone HTML as a versioned artifact. Returns `OK <slug>@<version>` + file path + repoId + shareable `view:` link. |
| `artifact_read` | Read HTML **for editing only** (latest or `version`, `offset`/`limit` paging). Never use it to show content to the user. |
| `artifact_update` | Save a new version (never rewrites). Pass `baseVersion` from `artifact_read`; on mismatch returns `CONFLICT` instead of overwriting. Returns the `view:` link. |
| `artifact_versions` | Version history JSON for rollback picks. |
| `artifact_list` | All artifacts in the current repo. |
| `artifact_show` | **Shareable dashboard link** for an artifact (`artifact:` URL with `?select=<slug>`), or the all-artifacts overview with no slug. Use it whenever the user asks to see, show, open, or explain an artifact. |

Plus:

- `/artifact show [slug]` slash command (dashboard link) and `/artifact list` (slugs + overview link).
- `artifacts://<slug>` / `artifacts://<slug>/<version>` read-only protocol for omp's read tool (immutable; best-effort — tools work even if the omp internal router moved).

## Model (does not change)

- Content tools write through `@tarileo/artifact-store` (`LocalStore`) directly: **no daemon needed for create/read/update**. Only link resolution (`artifact_show`, `view:` lines, `/artifact show`) reads `~/.artifact/daemon.json` and probes `/api/health` — best-effort, never fails a write.
- Source of truth: global store `~/.artifact/store/<repoId>/` (stable id across worktrees). Each save creates `versions/vNNN`, updates `index.html` + `meta.json` + `manifest.json`, and leaves `docs/artifacts/<slug>/index.html` as a symlink.
- The dashboard sees tool writes via symlink + watcher.
- Slugs are normalized (`slugify`: lowercase, strip accents, non-alphanumeric → `-`, max 60 chars).

## Error contract (stable, agents rely on it)

- `OK <slug>@<version>` — write succeeded.
- `NOT_FOUND <slug>[@<version>]` — read/update/versions on unknown slug. Updates must tell the agent to use `artifact_create`.
- `CONFLICT <slug>: latest is <v>, base was <v>` — `artifact_update` with stale `baseVersion`. Agent must `artifact_read` again and retry.
- `NO_DAEMON ... Start with: artifact start` — `artifact_show` (or empty `view:`) when the daemon lock is missing or the daemon doesn't answer `/api/health`. Same message as CLI `artifact url`.

## Dev

```bash
bun run --cwd packages/pi-extension build      # tsc → dist/
bun run --cwd packages/pi-extension typecheck  # tsc --noEmit
bunx vitest run packages/pi-extension          # protocol tests
```

Publish only via GitHub Release (`omp-v*` tag triggers `publish.yml`); never `npm publish` by hand.
