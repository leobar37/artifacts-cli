# Índice de tareas: Fiabilidad + mockups + selector

Orden: **0 → 1 → 2 → 3**. La Fase 0 va primera porque sin logs el diagnóstico de caídas es adivinanza; el resto es independiente entre sí pero conviene ese orden (viewer antes que cosmética).

## Fase 0 — Instrumentación
- [x] **0.1** Logger con sink a archivo (`~/.artifact/daemon.log`): boot, errores de request, watcher, shutdown; truncado al arrancar si excede N líneas.
- [x] **0.2** Handlers `uncaughtException`/`unhandledRejection` → log con stack (+ política seguir/salir).
- [x] **0.3** Comando `artifact logs [--tail N] [--follow]`.
- [x] **0.4** Verificación: matar el daemon con una request mala / excepción forzada en dev y comprobar que el log lo cuenta; typecheck + tests.

## Fase 1 — Viewer robusto
- [x] **1.1** Timeout (~15s) + estado de error con Retry + 1 reintento automático en `ArtifactViewer`.
- [x] **1.2** Probe a `/api/health`: si el daemon no responde, mensaje "unreachable + `artifact start`" en vez de spinner.
- [x] **1.3** Indicador de conexión en el header (poll a `/api/health` cada ~30s).
- [x] **1.4** Verificación: daemon apagado a propósito → error claro (no spinner eterno); tests de los estados que sean unit-testeables; smoke.

## Fase 2 — Selector rediseñado
- [x] **2.1** Componente `ProjectSwitcher` (botón + popover): nombre, path truncado, conteos, check actual, teclado ↑↓/Enter/Esc, cierre al click afuera.
- [x] **2.2** Reemplaza el `<select>` en `Header.tsx`; el switcher solo aparece con >1 proyecto (comportamiento actual).
- [x] **2.3** Verificación con el setup mock (Fase 3) en ambos temas si aplica + viewport angosto.

## Fase 3 — Setup mockup
- [x] **3.1** Script `bun run mock`: genera `/tmp/artifact-mock/` (proyecto lleno variado + proyecto vacío), levanta daemon con `ARTIFACT_DIR` aislado, abre `/`.
- [x] **3.2** Fixtures versionados + README (Desarrollo) documentando el flujo pre-deploy.
- [x] **3.3** Checklist visual FR-32 ejecutado una vez y anotado.

## Cierre
- [x] **4.1** typecheck + vitest + build + smoke e2e completo (2 proyectos, kill/reconnect, `artifact logs`).
- [x] **4.2** Commit(s) en `main`. Release patch (`0.2.2`) + update VPSs: **decidir con el usuario** (el fix lo amerita si el viewer/selector cambian comportamiento visible; si es solo cosmética+logs, puede esperar al siguiente batch).
- [x] **4.3** Con el log ya existiendo, revisitar la causa raíz de las caídas originales con evidencia (follow-up explícito, no adivinanza).

## Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| La causa real de las caídas no es el viewer sino el server | Fase 0 primero; FR-03 deja evidencia para el follow-up 4.3 |
| `artifact logs --follow` complica el CLI | `--follow` opcional; v1 puede ser solo `--tail` |
| El mock se desincroniza del producto real | Fixtures mínimos y generados por script, no copiados a mano |
| Scope creep (Playwright, métricas, multi-usuario) | Explícitamente fuera de v1 en FR-32 |
