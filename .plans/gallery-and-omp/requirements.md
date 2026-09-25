# Requisitos: Galería + link + omp global

## Track A — "Dame el link para ver todos" (cerrar trabajo pausado)

### FR-A1 — Vista raíz con todo agrupado
**Como** usuario **quiero** abrir la URL base del daemon (`/`) y ver **todos** los artifacts de **todos** los proyectos registrados, **agrupados por producto**, **para** no saltar entre URLs.
- Cada grupo muestra: nombre del producto (link a su `/p/<id>/`), path, conteo y sus artifacts (título, tipo, fecha).
- Click en un artifact → dashboard del proyecto con ese artifact ya seleccionado (`?select=<slug>`).
- Cero proyectos → hint con `artifact start` (reemplaza al picker en la raíz; el picker sigue para ids desconocidos).

### FR-A2 — Link en un paso para el agente
**Como** usuario **quiero** decirle al agente "dame el link" y que ejecute **un solo comando** (`artifact url`) que imprima la URL raíz, **para** pegarla en el chat/navegador.
- `artifact url` → `http://<host>:<puerto>/` (falla claro si el daemon está caído: "Start with: artifact start").
- `artifact url <projectId>` → URL de ese proyecto (404 claro si no existe).

### FR-A3 — Sin regresiones
- Typecheck (dashboard + node), suite vitest completa, `vite build`.
- Smoke visual real: daemon con 2 proyectos, abrir `/`, verificar grupos + click → `?select=` selecciona.
- Docs al día: README (usage/commands), SKILL (workflow + essentials), `references/commands.md`.

### Aceptación A
- [ ] `artifact url` imprime la raíz y abre una galería con todos los artifacts agrupados.
- [ ] Click navega a `/p/<id>/?select=<slug>` y el artifact queda seleccionado.
- [ ] Tests verdes (incl. e2e del overview) y commit en `main`.

## Track B — Extensión omp global en ambos VPS

### FR-B1 — Tools disponibles para cualquier sesión del agente
**Como** usuario **quiero** que en ubuntu-dev y vultr-dev cualquier sesión de pi tenga `artifact_create/read/update/versions/list`, **para** que los agentes creen artifacts sin el CLI.
- Instalación a nivel usuario (`~/.pi/agent`), que es lo "global" en omp: vale para todas las sesiones de ese user.
- Método: `omp plugin install @tarileo/artifact-omp[@ver]` (confirmar sintaxis exacta con `omp plugin --help` en sitio; alternativa: entrada `npm:@tarileo/artifact-omp` en `packages[]` de `settings.json`).

### FR-B2 — Versión consistente en inglés
- Estado: npm tiene omp `0.1.2` con strings en español; el repo ya los tiene en inglés (solo strings, cero cambios funcionales).
- Decisión abierta (B-D1): publicar `0.1.3` (patch, semver correcto) o instalar `0.1.2` tal cual.
- Si se publica: bump → commit → tag/release `omp-v0.1.3` (el workflow publica cualquier release; salta store/CLI ya publicados) → verificar en npm con `--prefer-online`.

### FR-B3 — Verificación extremo a extremo por VPS
- [ ] El plugin aparece cargado (lista de plugins/tools de pi, sin errores en arranque).
- [ ] Crear un artifact de prueba vía tool → aparece en `docs/artifacts/<slug>/` y en el dashboard (`artifact start` temporal + `stop` + `unregister`, como en smokes previos).
- [ ] Rollback conocido: comando de desinstalación verificado (`remove/uninstall`, según `--help`).

### No-funcionales
- NFR-1: Nada del track B toca el daemon/store/CLI ya instalados (solo añade el plugin).
- NFR-2: Todo cambio de código del track A pasa por typecheck + tests + smoke antes de commit (regla del repo).
- NFR-3: Publicar en npm solo vía GitHub Release (no `npm publish` manual).
