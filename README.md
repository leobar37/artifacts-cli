# Artifact CLI

[![skills.sh](https://skills.sh/b/leobar37/artifacts-cli)](https://skills.sh/leobar37/artifacts-cli)

CLI para gestionar y visualizar artifacts HTML generados por Claude Code.

## Requisitos

- Node.js >= 18
- pnpm >= 8
- Proyecto con artifacts en `docs/artifacts/*/index.html`

## Instalación

```bash
npm i -g @tarileo/artifacts-cli
```

Desde fuente:

```bash
pnpm install
pnpm link --global
```

## Uso

```bash
# En un proyecto con docs/artifacts/
artifact start         # Inicia servidor y abre dashboard (puerto 7000+)
artifact start --build # Fuerza rebuild antes de iniciar
artifact list          # Muestra instancias activas
artifact stop          # Detiene la instancia actual
artifact stop --all    # Detiene todas las instancias
```

- `artifact start [-p <port>] [--host <host>] [--tailscale] [--no-open] [--build]` - Iniciar servidor (puerto automático 7000-7100)
- `artifact list` - Listar instancias
- `artifact stop [--all]` - Detener servidor(es)

## Exponer en red / Tailscale

```bash
artifact start --host tailscale  # o: artifact start --tailscale
artifact start --host 192.168.1.50
ARTIFACT_HOST=mi-host artifact start
```

Con `--host` no-loopback el servidor escucha en `0.0.0.0` y el lockfile guarda el host visible (`artifact list` muestra la URL correcta).

## Características

- **Dashboard React** con navegación fluida
- **Renderizado aislado** de artifacts vía iframe sandboxed
- **Puertos 7000-7100** asignados automáticamente
- **Build automático** - Si no existe dist/, se compila automáticamente
- **Múltiples proyectos** - Cada proyecto tiene su propia instancia
- **Host configurable** - `--host` / `--tailscale` para exponer en LAN o Tailnet
- **Tema oscuro** - Consistente con artifacts existentes

## Desarrollo

```bash
# Instalar dependencias
pnpm install

# Build del dashboard y servidor
pnpm run build

# Desarrollo del dashboard (con HMR)
pnpm run dev

# Desarrollo del servidor (con watch)
pnpm run dev:server
```

## Estructura

```
~/.claude/artifacts/
├── src/
│   ├── cli/         # Entry point y comandos
│   ├── server/      # Express server
│   ├── dashboard/   # React app
│   └── utils/       # Utilidades
└── dist/            # Build output
```

## Notas

- El CLI detecta automáticamente si el dashboard necesita ser compilado
- Usa `--build` para forzar rebuild antes de iniciar
- Cada proyecto se identifica por su ruta absoluta
- El lockfile se guarda en `~/.artifact/instances.json`
