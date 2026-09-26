# Requisitos: Fiabilidad + mockups + selector

## Fase 0 — Instrumentación (prerrequisito para diagnosticar caídas)

### FR-01 — Log del daemon a archivo
**Como** usuario **quiero** que el daemon escriba a `~/.artifact/daemon.log` (append, con timestamps), **para** saber por qué murió después del hecho.
- Incluye: boot (puerto/host/pid), requests con error (4xx/5xx + slug), eventos del watcher, errores no capturados, shutdown.
- Rotación simple: truncar a N líneas (ej. 5000) al arrancar si excede, o append puro en v1 (decidir en implementación; recomiendo truncado al boot).

### FR-02 — Comando `artifact logs`
**Como** usuario **quiero** `artifact logs [--tail N] [--follow]` que imprima el log del daemon, **para** diagnosticar sin SSH-jugar con archivos.
- `--follow` opcional v1; `--tail 100` por defecto.

### FR-03 — Handlers globales de errores
**Como** operador **quiero** `uncaughtException`/`unhandledRejection` logueados con stack en `daemon.log`, **para** que ningún crash quede mudo.
- Decisión de diseño: loggear y **seguir vivo** (daemon de preview, no crítico) vs. salir. Recomendación: log + seguir, con contador; si >N en 1 min, salir para no loopear.

## Fase 1 — Viewer que nunca se atasca

### FR-11 — Timeout + reintento en el preview
**Como** usuario **quiero** que si el iframe no carga en ~15s aparezca un estado de error con botón **Retry** (y 1 reintento automático), **para** no quedarme en "Loading..." eterno.
- El estado distingue (vía probe a `/api/health`): daemon caído → mensaje "daemon unreachable, run `artifact start`" en vez de retry ciego.

### FR-12 — Salud visible
**Como** usuario **quiero** un indicador de conexión en el dashboard (punto verde/gris en el header, chequeo periódico a `/api/health`), **para** saber si el problema es el server antes de culpar al artifact.

## Fase 2 — Selector de proyecto rediseñado

### FR-21 — Dropdown propio con el tema
**Como** usuario **quiero** un selector que parezca parte del dashboard (botón + popover, no `<select>` nativo), **para** que no se vea roto.
- Muestra: nombre, path (truncado), conteo de artifacts; check en el actual; navegación por teclado básica (↑↓/Enter/Esc); cierra al click afuera.
- Reutiliza tokens existentes; sin nuevas dependencias (headless con divs + estado local).

## Fase 3 — Setup mockup para previsualizar antes de deployar

### FR-31 — Comando `bun run mock` (o `artifact dev --mock`, decidir)
**Como** dev **quiero** un comando que levante el dashboard con **datos falsos representativos** sin tocar mis proyectos reales, **para** ver cambios visuales antes de deployar.
- Genera en `/tmp/artifact-mock/` 3 proyectos semilla: uno con 8-10 artifacts variados (títulos largos, los 3 tipos, fechas y tamaños dispersos), uno vacío, y slugs con caracteres límite.
- Usa `ARTIFACT_DIR` aislado (no contamina `~/.artifact`) y abre el browser en `/`.
- Script + fixtures versionados en el repo (`scripts/mock/` o `src/dev/`); documentado en README (sección Desarrollo).

### FR-32 — Checklist visual (no automatización pesada en v1)
- [ ] Raíz agrupa por producto, conteos correctos, proyecto vacío con hint.
- [ ] Selector: abre/cierra, teclado, cambia de proyecto.
- [ ] Viewer: carga, timeout forzado (daemon apagado a propósito), retry.
- [ ] Móvil (viewport angosto): sidebar + viewer.
- Playwright/screenshots: explícitamente **fuera** de v1 (evaluar después si el checklist manual duele).

## No-funcionales
- NFR-1: Sin nuevas dependencias de prod salvo justificación (el dropdown es hand-rolled).
- NFR-2: Todo pasa por typecheck + vitest + build + smoke (regla del repo); el mock no corre en CI salvo que sea <30s.
- NFR-3: `daemon.log` nunca incluye contenido de artifacts (solo slugs/paths/errores).
