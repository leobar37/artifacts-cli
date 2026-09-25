# Contexto: Galería "todos los artifacts" + extensión omp global

## Objetivo
1. Poder pedirle al agente "dame el link para ver todos los artifacts" y recibir **un solo link** con todo, separado por producto.
2. Tener la extensión omp (`@tarileo/artifact-omp`) instalada **globalmente** en los dos VPS (ubuntu-dev, vultr-dev), para que los agentes creen artifacts sin depender del CLI.

## Punto de partida (verificado 2026-09-25)

### Repo local (`/Users/leobar37/code/artifact-cli`, branch `main`)
- Commits pusheados hasta `b266d74` + `94f815e` (release v0.2.0 en npm).
- **Trabajo SIN commitear en el worktree**: la galería (track A) está implementada a medias:
  - `GET /api/overview` en `src/server/index.ts` (agrupa artifacts por proyecto).
  - `useOverview` + `Overview.tsx` (vista raíz agrupada), `?select=<slug>` en `App.tsx`.
  - Comando `artifact url [projectId]`.
  - Test e2e del overview. Docs parciales (README/SKILL/commands.md tocados).
  - ⚠️ Los últimos edits al README quedaron a medio aplicar (revisar `git diff` antes de seguir).
- npm: CLI `0.2.0`, store `0.1.2`, omp `0.1.2` (este último con strings en español; funcionalmente idéntico al actual).

### Modelo vigente (no cambia)
- Un daemon por máquina (puerto 7000), proyectos en `~/.artifact/projects.json`, lock en `daemon.json`.
- Store global `~/.artifact/store/<repoId>/`, HTML-only (TSX eliminado).
- Los tools omp (`artifact_create/read/update/versions/list`) usan `LocalStore` directo: **no dependen del daemon** ni del modelo de server. El dashboard los ve vía symlink + watcher.

### VPS
| | ubuntu-dev (100.83.90.33, Tailscale) | vultr-dev (64.176.20.128, pública) |
|---|---|---|
| SO / user | Ubuntu / leobar37 | Debian / linuxuser |
| Bun | 1.4.2 | 1.4.2 |
| CLI | 0.2.0 global por npm ✅ | 0.2.0 global por npm ✅ |
| Skill | `~/.agents/skills/artifacts-cli` al día + symlinks en `.claude/skills` y `.pi/agent/skills` ✅ | `~/.agents/skills/artifacts-cli` al día; pi la lee por `"skills": ["~/.agents/skills"]` en `settings.json` ✅ (sin `~/.claude`) |
| omp plugin | ❌ no instalado | ❌ no instalado (pi usa `settings.json`: `extensions[]` + `packages[]` con `npm:...`) |
| Clone repo | `~/code/artifact-cli` en `b266d74` | sin clon |

## Supuestos
- SSH con agent/keys funciona a ambos VPS (probado).
- Publicar en npm requiere bump + GitHub Release (dispara `publish.yml`, que ya funcionó para v0.2.0).
- `npm view` miente por caché local: verificar releases con `--prefer-online` o contra el registry directo.
