# Commands reference — `artifact`

One daemon (port 7000 by default) serves all registered projects. Each project
has its own dashboard URL: `http://<host>:<port>/p/<projectId>/`.

## `artifact init`

Scaffold `docs/artifacts/` for the current project and add it to
`.gitignore` (working copy; the store is the source of truth). Run once
per project before creating artifacts.

## `artifact start`

Ensure the daemon is running, register the current project, open its dashboard.

| Flag | Description |
|------|-------------|
| `-p, --port <port>` | Daemon port (default 7000, auto-retry next 10 on first boot; pinned in `daemon.json` after) |
| `--host <host>` | Host to advertise: IP/hostname, or `tailscale` to auto-detect the Tailscale IPv4 |
| `--tailscale` | Shortcut for `--host tailscale` |
| `--no-open` | Do not open the browser automatically |
| `--build` | Force dashboard rebuild before starting |
| `--dev` | Dev mode: daemon in-process + Vite HMR dashboard |

If the daemon already runs, `start` only registers the project (and notifies
the daemon's file watcher) and prints its URL. No new process is spawned.

Non-loopback `--host` binds `0.0.0.0`. The advertised host persists in
`~/.artifact/daemon.json`. `ARTIFACT_HOST` env works as default.

## `artifact serve`

Run the daemon in the foreground (single server for all projects). Same
`-p`/`--host`/`--tailscale` flags as `start`. Used by `start` under the hood
(spawned detached) and directly for `systemd`/`tmux`:

```bash
artifact serve --port 7000   # e.g. ExecStart=artifact serve --port 7000
```

## `artifact list`

Show daemon status (running/stopped, URL, PID) plus every registered project
with artifact count and per-project dashboard URL.

## `artifact stop`

Stop the daemon (SIGTERM, removes the daemon lock). The project registry
persists — `start` brings the daemon back with the same projects.

## `artifact unregister [projectId]`

Remove a project from the registry (defaults to the current directory).
Notifies the live daemon to drop its watcher; also works while stopped.

## `artifact reload <slug>`

POST `/p/<projectId>/api/artifacts/<slug>/reload` to the running daemon so
the dashboard re-fetches that artifact (project resolves from cwd, must be
registered).

## `artifact validate <slug>`

Validate a `content.tsx` artifact locally (no daemon needed).
