---
name: artifacts-cli
description: Manage and preview HTML artifacts with the artifact CLI (start, list, stop, reload, --host, --tailscale). Use when working with docs/artifacts, previewing generated HTML/TSX artifacts in the dashboard, or exposing the artifact viewer over LAN or Tailscale.
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

1. Every artifact lives in `docs/artifacts/<slug>/` with `index.html`
   (static) or `content.tsx` (compiled to a bundle on the fly).
2. Start the server in the project root:
   ```bash
   artifact start
   ```
   The dashboard opens automatically (ports 7000-7100, first free wins).
3. Pick an artifact in the sidebar; it renders isolated in the viewer.
   Edits to `index.html`/`content.tsx` hot-reload via file watcher + SSE.

## Commands

See [commands reference](references/commands.md) for the full flag list.
The essentials:

```bash
artifact start [-p <port>] [--host <host>] [--tailscale] [--no-open] [--build]
artifact list
artifact stop [--all]
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

Non-loopback hosts bind `0.0.0.0`; the advertised host is stored in the
instance lockfile so `artifact list` prints the right URL.

## Troubleshooting

- `No server running ... Start with: artifact start` → the lockfile
  (`~/.artifact/instances.json`) is stale or the server died; just `start` again.
- Port in use → the server auto-retries the next 10 ports.
- Dashboard shows stale list → the API caches the scan for 30s; file changes
  invalidate it via the watcher.
- `--tailscale` falls back to localhost when `tailscale ip -4` fails
  (Tailscale not installed or logged out).

## Flujo versionado (agentes con la extensión omp)

Con `@tarileo/artifact-omp` linkeado (`omp plugin link ./packages/pi-extension`
o `omp plugin install @tarileo/artifact-omp`), el agente NUNCA escribe
`docs/artifacts/` a mano. Usa estos tools:

- `artifact_create` — guarda HTML nuevo (crea `v001`).
- `artifact_read` — lee el `latest` (o `versión` + `offset/limit` para HTMLs grandes). Úsalo antes de editar.
- `artifact_update` — guarda edición como versión nueva. Pasa `baseVersion` del read: si otro tocó el artifact en medio, responde `CONFLICT` en vez de pisar.
- `artifact_versions` — historial para rollback (re-publicar ese HTML vía `artifact_update`).
- `artifact_list` — slugs del repo actual.

Cada `put` versiona en el store global (`~/.artifact/store/<repoId>/`, mismo id
en todos tus worktrees) y deja `docs/artifacts/<slug>/index.html` como symlink
al `latest` — el dashboard y el `Read` lo ven como archivo normal.

Lectura directa sin tools: `artifacts://<slug>` (latest) o
`artifacts://<slug>/<version>` (ej. `/v002`) vía el read tool de omp.

`docs/artifacts/` está ignorado en git por diseño: la verdad vive en el store.
