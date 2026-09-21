# Commands reference — `artifact`

## `artifact start`

Start the artifact server for the current project.

| Flag | Description |
|------|-------------|
| `-p, --port <port>` | Specific port (must be 7000-7100); otherwise first free port wins |
| `--host <host>` | Host to advertise: IP/hostname, or `tailscale` to auto-detect the Tailscale IPv4 |
| `--tailscale` | Shortcut for `--host tailscale` |
| `--no-open` | Do not open the browser automatically |
| `--build` | Force dashboard rebuild before starting |
| `--dev` | Dev mode: API server + Vite HMR dashboard |

Non-loopback `--host` binds `0.0.0.0`. The advertised host persists in
`~/.artifact/instances.json`. `ARTIFACT_HOST` env works as default.

## `artifact list`

List all registered instances with status and URL.

## `artifact stop [--all]`

Stop the current project's server, or every registered instance with `--all`.

## `artifact reload <slug>`

POST `/api/artifacts/<slug>/reload` to the running server so the dashboard
re-fetches that artifact (uses the stored host/port).
