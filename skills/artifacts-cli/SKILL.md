---
name: artifacts-cli
description: Manage and preview HTML artifacts with the artifact CLI (single daemon on port 7000, per-project /p/<id> dashboard URLs). Use when working with docs/artifacts, previewing generated HTML/TSX artifacts in the dashboard, or exposing the artifact viewer over LAN or Tailscale.
---

# Artifacts CLI

CLI + dashboard for managing and previewing HTML artifacts
(`docs/artifacts/<slug>/index.html` or `content.tsx`).
Published as `@tarileo/artifacts-cli`, binary `artifact`.

## Install

```bash
bun install -g @tarileo/artifacts-cli
```

## Workflow

1. New project? Run `artifact init` once: it scaffolds `docs/artifacts/`
   and adds it to `.gitignore`.
2. Every artifact lives in `docs/artifacts/<slug>/` with `index.html`
   (static) or `content.tsx` (compiled to a bundle on the fly).
3. Ensure the daemon and open this project's dashboard:
   ```bash
   artifact start
   ```
   This starts the shared daemon if needed (port 7000), registers the project,
   and opens its dashboard at `/p/<projectId>/`.
4. Pick an artifact in the sidebar; it renders isolated in the viewer.
   Edits to `index.html`/`content.tsx` hot-reload via file watcher + SSE.

## Commands

See [commands reference](references/commands.md) for the full flag list.
The essentials:

```bash
artifact init
artifact create <slug> [-t <title>] [--type <type>] [--tsx]   # scaffold index.html (or content.tsx)
artifact start [-p <port>] [--host <host>] [--tailscale] [--no-open] [--build]
artifact serve [-p <port>] [--host <host>] [--tailscale]   # foreground daemon (systemd)
artifact list
artifact stop
artifact unregister [projectId]
artifact reload <slug>
```

## Artifact conventions

- Directory per artifact: `docs/artifacts/<slug>/`.
- Format: `index.html` (static) or `content.tsx` (React, bundled with esbuild).
- Type detection: `<meta name="artifact-type" content="study|wireframe|generic">`,
  with heuristics fallback (`x-data` Alpine markers, `wireframe`/`mockup` keywords).
- `<title>` becomes the sidebar label; newest-modified sorts first.

## Exposing over the network

```bash
artifact start --tailscale   # advertise the Tailscale IPv4
artifact start --host 192.168.1.50
ARTIFACT_HOST=my-host artifact start
```

Non-loopback hosts bind `0.0.0.0`; the advertised host is stored in
`~/.artifact/daemon.json` so `artifact list` prints the right URL.

## Troubleshooting

- `No daemon running ... Start with: artifact start` → the daemon lock
  (`~/.artifact/daemon.json`) is stale or the daemon died; just `start` again.
- Port in use → the daemon auto-retries the next 10 ports on first boot, then
  pins the port in `daemon.json`.
- Dashboard shows stale list → the API caches the scan for 30s; file changes
  invalidate it via the watcher.
- `--tailscale` falls back to localhost when `tailscale ip -4` fails
  (Tailscale not installed or logged out).

## Versioned workflow (agents with the omp extension)

With `@tarileo/artifact-omp` linked (`omp plugin link ./packages/pi-extension`
or `omp plugin install @tarileo/artifact-omp`), the agent NEVER writes
`docs/artifacts/` by hand. Use these tools:

- `artifact_create` — saves new HTML (creates `v001`).
- `artifact_read` — reads `latest` (or `version` + `offset/limit` for large HTML files). Use it before editing.
- `artifact_update` — saves edits as a new version. Pass the `baseVersion` from the read: if someone else touched the artifact meanwhile, it answers `CONFLICT` instead of overwriting.
- `artifact_versions` — history for rollback (re-publish that HTML via `artifact_update`).
- `artifact_list` — slugs in the current repo.

Each `put` versions into the global store (`~/.artifact/store/<repoId>/`, same id
across all your worktrees) and leaves `docs/artifacts/<slug>/index.html` as a symlink
to `latest` — the dashboard and `Read` see it as a regular file.

Direct reads without tools: `artifacts://<slug>` (latest) or
`artifacts://<slug>/<version>` (e.g. `/v002`) via omp's read tool.

`docs/artifacts/` is git-ignored by design: the store is the source of truth.
