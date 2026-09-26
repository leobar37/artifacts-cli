# Contexto: Fiabilidad del dashboard + preview con mockups

## Objetivo
1. Eliminar el estado "cargando eterno" y los caídos intermitentes del daemon.
2. Rediseñar el selector de proyecto (hoy un `<select>` nativo sin estilo).
3. Tener un setup con datos mock para ver cambios visuales **antes** de deployar.

## Punto de partida (verificado 2026-09-26, CLI 0.2.1)

### Síntomas reportados (screenshot + usuario)
- Viewer atascado en "Loading preview..." con sidebar cargada (la API responde, el iframe no termina).
- "A veces funciona y a veces se cae el servidor o algo así".
- Selector de proyecto feo (nativo, sin tema).

### Hechos del código (causas probables, no confirmadas)
1. **Sin timeout en el viewer** (`ArtifactViewer.tsx`): `isLoading` solo se apaga en `onLoad`/`onError` del iframe. Si el daemon está caído (conexión rechazada), `onLoad` puede no dispararse nunca → spinner eterno sin mensaje ni reintento.
2. **Sin logs persistentes**: el daemon corre detached con logs solo a consola (`createLogger`); si muere, no queda rastro de por qué. No hay `artifact logs` ni archivo en `~/.artifact/`.
3. **Sin handlers globales**: no hay `uncaughtException`/`unhandledRejection` en el boot del server; cualquier throw no capturado mata el proceso en silencio.
4. **Sospechosos concretos sin confirmar**: `readdirSync` fuera del try en `scanner.ts` (un path con permisos raros → 500, no crash); watcher chokidar sobre dirs borrados; OOM con artifacts gigantes; doble daemon peleando el puerto (el retry 7000-7010 enmascara el conflicto).
5. **Selector**: `<select>` nativo agregado rápido en `Header.tsx`, sin estilos del sistema de diseño.
6. **Sin entorno mock**: `--dev` exige checkout fuente + proyectos reales; no hay fixtures ni proyecto semilla; validar un cambio visual hoy = deployar o armar dirs a mano.

## Supuestos
- El daemon corre detached en VPS; el usuario lo reinstala vía `bun install -g` (no edita código allí).
- Deploy = release GitHub → npm → `bun install -g` en cada VPS (flujo probado en v0.2.0–0.2.1).
- Tema oscuro con tokens CSS existentes (`bg-panel`, `text-*`, `border-line`); el rediseño los reutiliza.
