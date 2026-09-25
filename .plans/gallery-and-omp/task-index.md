# Índice de tareas: Galería + omp global

Orden: **A → B**. A cierra código local (sin dependencias externas). B depende de npm/GitHub. B2 y B3 (un VPS cada uno) son independientes entre sí y pueden ir en cualquier orden.

## Track A — Galería + link (trabajo pausado, worktree sucio)

- [ ] **A0. Higiene del worktree**: `git status` + `git diff` para ver el estado real (los últimos edits al README quedaron parciales). `git stash list` debe estar vacío.
- [ ] **A1. Terminar código**: endpoint `/api/overview`, `Overview`, `?select=`, comando `url`. Releer cada archivo tocado y completar lo pendiente.
- [ ] **A2. Docs**: README (usage/commands), SKILL (workflow/essentials), `references/commands.md` (`artifact url` + galería).
- [ ] **A3. Verificación local**: `bun run typecheck` + `bunx vitest run` + `bun run build` + smoke visual con 2 proyectos (raíz agrupa, click selecciona, `artifact url` imprime).
- [ ] **A4. Commit** en `main` (`feat(dashboard): ...`). Push opcional (decidir con usuario; no requiere release).

## Track B — omp global en VPS

- [ ] **B0. Decisión B-D1** (bloquea B1): ¿bump omp a `0.1.3` en inglés, o instalar `0.1.2` tal cual?
- [ ] **B1. (si B-D1 = bump)** Bump `packages/pi-extension` a `0.1.3`, commit, tag/release `omp-v0.1.3`, vigilar workflow, verificar en npm con `--prefer-online`.
- [ ] **B2. ubuntu-dev**: confirmar sintaxis (`omp plugin --help`), instalar `@tarileo/artifact-omp[@ver]`, verificar tools cargados, e2e (crear artifact vía tool → visible en dashboard), dejar limpio (stop + unregister del proyecto de prueba).
- [ ] **B3. vultr-dev**: igual que B2 (aquí no hay `~/.claude`; pi lee `~/.agents/skills` por settings — no tocar skills).
- [ ] **B4. Rollback documentado**: comando exacto de desinstalación anotado en este plan tras verificarlo.

## Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| Sintaxis real de `omp plugin install` difiere de la doc | `--help` en sitio antes de instalar; alternativa `packages[]` en `settings.json` |
| pi requiere restart para cargar el plugin | Reiniciar la sesión/servicio de pi en el VPS y re-verificar tools |
| Lag/caché de npm al verificar (`npm view` miente) | Verificar con `--prefer-online` o registry directo (lección de v0.2.0) |
| Daemon de prueba olvidado corriendo en un VPS | Cada smoke termina con `stop` + `unregister` (checklist FR-B3) |
| Worktree con edits parciales del README | A0 antes de tocar código |

## Verificación final
- [ ] Aceptación A completa (3 checks).
- [ ] Aceptación B completa por VPS (FR-B3).
- [ ] `git status` limpio o con commits identificados; nada a medias.

## Ejecución (2026-09-25)
- Track A: commit `b43c3d0` (overview + `artifact url` + docs).
- omp `0.1.3` publicado (`omp-v0.1.3`, workflow verde; npm tarda minutos en replicar: verificar con `--prefer-online`).
- ubuntu-dev: `omp plugin install @tarileo/artifact-omp@0.1.3` ✅, e2e con agente (`artifact_create` → symlink + store) ✅, dashboard ✅, limpio (stop + unregister del proyecto de prueba).
- vultr-dev: idem ✅.
- Rollback (verificado en `omp plugin --help`, ACTION list): `omp plugin uninstall @tarileo/artifact-omp`.
- Nota: en ubuntu-dev se detuvo el daemon al cerrar el smoke y quedó un proyecto preexistente (`control-de-caja`, importado por la migración) registrado pero sin daemon: reactivar con `artifact start` si se usaba.
