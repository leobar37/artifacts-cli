# Artifact CLI

[![skills.sh](https://skills.sh/b/leobar37/artifacts-cli)](https://skills.sh/leobar37/artifacts-cli)

CLI para gestionar y visualizar artifacts HTML generados por agentes de código.
Cada artifact vive en `docs/artifacts/<slug>/` como `index.html` o `content.tsx`,
y el dashboard los muestra aislados con recarga automática.

> Toolchain: **solo [Bun](https://bun.sh)**. No se usa npm/pnpm/yarn.

## Requisitos

- Bun >= 1.0
- Proyecto con artifacts en `docs/artifacts/*/`

## Instalación

```bash
bun install -g @tarileo/artifacts-cli
```

Desde fuente:

```bash
bun install
bun link
```

## Skill para agentes

```bash
bunx skills add leobar37/artifacts-cli
```

Esto instala la skill `artifacts-cli` (compatible con [skills.sh](https://skills.sh/leobar37/artifacts-cli)):
workflow de artifacts, referencia de comandos, convenciones `index.html`/`content.tsx` y troubleshooting.

## Uso

```bash
# En un proyecto con docs/artifacts/
artifact start              # servidor + dashboard (puertos 7000-7100)
artifact start --build      # fuerza rebuild antes de iniciar
artifact start --tailscale  # expone el dashboard en tu Tailnet
artifact list               # instancias activas
artifact stop               # detiene la instancia actual
artifact stop --all         # detiene todas las instancias
artifact reload <slug>      # recarga un artifact en el dashboard
```

## Comandos

- `artifact start [-p <port>] [--host <host>] [--tailscale] [--no-open] [--build] [--dev]` — servidor (puerto automático 7000-7100)
- `artifact list` — listar instancias
- `artifact stop [--all]` — detener servidor(es)
- `artifact reload <slug>` — recargar un artifact
- `artifact validate <slug>` — validar un `content.tsx`

## Exponer en red / Tailscale

```bash
artifact start --host tailscale  # o: artifact start --tailscale
artifact start --host 192.168.1.50
ARTIFACT_HOST=mi-host artifact start
```

Con `--host` no-loopback el servidor escucha en `0.0.0.0` y el lockfile guarda
el host visible (`artifact list` muestra la URL correcta).

## Características

- **Dashboard React** con navegación fluida
- **Renderizado aislado** de artifacts vía iframe sandboxed
- **TSX compilado** al vuelo con esbuild + validación
- **Puertos 7000-7100** asignados automáticamente
- **Build automático** — si no existe `dist/`, se compila al iniciar
- **Múltiples proyectos** — cada proyecto tiene su propia instancia
- **Host configurable** — `--host` / `--tailscale` para LAN o Tailnet
- **Tema oscuro**

## Desarrollo

```bash
bun install          # dependencias (workspace raíz + packages/*)
bun run build        # dashboard + servidor
bun run dev          # dashboard con HMR
bun run dev:server   # servidor con watch
bun run typecheck    # tsc dashboard + node
bunx vitest run      # tests
```

## Estructura

```
.
├── src/
│   ├── cli/         # entry point y comandos
│   ├── server/      # servidor Hono + watcher + compilador TSX
│   ├── dashboard/   # app React (Vite)
│   ├── handlers/    # tipos de artifact (generic/study/wireframe)
│   └── utils/       # scanner, lockfile, puertos, host/tailscale
├── packages/
│   ├── store/         # @tarileo/artifact-store: storage compartido
│   └── pi-extension/  # @tarileo/artifact-omp: extensión para agentes
├── skills/
│   └── artifacts-cli/ # skill portable (SKILL.md)
├── landing/           # sitio estático (deploy en Vercel)
└── dist/              # build (generado, no se commitea)
```

## Notas

- El CLI detecta automáticamente si el dashboard necesita compilarse; usa `--build` para forzar.
- Cada proyecto se identifica por su ruta absoluta; el lockfile vive en `~/.artifact/instances.json`.
- Publicación a npm vía GitHub Actions con OIDC (ver `.github/workflows/publish.yml`).
