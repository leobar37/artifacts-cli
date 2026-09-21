# Plan de despliegue: npm + skill (skills.sh) + landing (Vercel)

Fecha: 2026-09-21. Paquete: `@tarileo/artifacts-cli` v0.1.0.
Objetivo: publicar la CLI en npm con CI, exponer una skill instalable vía
`npx skills add leobar37/artifacts-cli` (compatible con skills.sh) y colgar una landing simple en Vercel.

Fuentes: [skills.sh docs](https://www.skills.sh/docs) · [`vercel-labs/skills` CLI](https://github.com/vercel-labs/skills) · [npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers/) · [Agent Skills spec](https://github.com/anthropics/skills/blob/main/spec/agent-skills-spec.md).

---

## 0. Hallazgos previos (bloqueadores reales)

1. **`package.json` no tiene `repository` ni `publishConfig`.** npm Trusted Publishing
   exige que `repository.url` coincida exactamente con el repo de GitHub del workflow.
2. **`dist/` está en `.gitignore` (correcto), pero el `bin` necesita bit ejecutable.**
   Hoy `dist/cli/index.js` tiene `+x`, pero `tsc` no preserva el bit: un `dist`
   construido en CI sale sin `+x` y el binario instalado falla con `EACCES`.
   Hay que agregar `chmod +x` al build o al workflow.
3. **No existe `.github/workflows/`.** Hay que crearlo desde cero.
4. **No existe `skills/`.** skills.sh descubre skills escaneando el repo:
   cada skill vive en `skills/<nombre>/SKILL.md` (único archivo obligatorio).
   Instalación del usuario final: `npx skills add <owner/repo>`.
5. **No existe landing.** La opción más simple: carpeta `landing/` con HTML estático
   + `vercel.json`, conectada como proyecto Vercel aparte con *Root Directory* = `landing/`.

## 1. Fase 1 — Publicar la CLI en npm vía GitHub Actions

### 1.1 Cambios en `package.json`

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/<owner>/<repo>.git"
  },
  "publishConfig": { "access": "public" },
  "scripts": {
    "build:server": "tsc -p tsconfig.node.json && chmod +x dist/cli/index.js"
  }
}
```

### 1.2 Workflow `.github/workflows/publish.yml` (recomendado: OIDC, sin token)

Disparo: release publicada (`release: types: [published]`) o tag `v*`.
Permisos: `contents: read` + `id-token: write`. Runner ubuntu, Node 22+ (npm ≥ 11.5.1).

```yaml
name: Publish to npm
on:
  release:
    types: [published]
permissions:
  contents: read
  id-token: write
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      # setup-node escribe `_authToken=${NODE_AUTH_TOKEN}` vacío y rompe OIDC:
      - run: sed -i '/_authToken/d' "${NPM_CONFIG_USERCONFIG:-$HOME/.npmrc}"
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck
      - run: pnpm run build
      - run: npm publish --access public   # OIDC + provenance automática
```

Trampa conocida (`actions/setup-node#1551`): sin el `sed`, npm falla con `ENEEDAUTH`
en vez de intentar OIDC.

### 1.3 Configuración manual (una sola vez, no se automatiza)

1. Publicar una primera versión manual (`npm publish --access public`) — npm solo
   permite registrar *Trusted Publisher* sobre un paquete que ya existe.
2. En npmjs.com → paquete → Settings → Trusted Publisher → GitHub Actions:
   owner, repo, workflow `publish.yml` (solo el nombre, case-sensitive), environment si aplica.
3. Opcional: environment `npm-publish` con revisores requeridos; restringir a tags/releases.
4. Borrar tokens viejos de npm; opcionalmente activar *"Require 2FA and disallow tokens"*
   (Trusted Publishing sigue funcionando porque usa OIDC, no tokens).

### 1.4 Versionado (decisión abierta)

- Simple: bump manual de `version` + GitHub Release → dispara el workflow.
- Escalable: `changesets` (PR de release automático). Recomendado solo si habrá
  releases frecuentes; para v0.x el flujo manual basta.

## 2. Fase 2 — Skill compatible con skills.sh

### 2.1 Estructura (estándar portable Agent Skills)

```
skills/
└── artifact-cli/
    ├── SKILL.md            # obligatorio
    ├── references/
    │   └── commands.md     # opcional: referencia de comandos/flags
    └── assets/             # opcional: logo, ejemplos
```

`SKILL.md` usa **solo** frontmatter portable (`name` + `description`; nada de
`allowed-tools`/`model`, que son propietarios de cada cliente):

```markdown
---
name: artifact-cli
description: Manage and preview HTML artifacts with the artifact CLI (start, list, stop, reload, --tailscale). Use when working with docs/artifacts, previewing generated HTML/TSX artifacts, or exposing the artifact dashboard over Tailscale.
---

# Artifact CLI
...
```

Reglas del spec: `name` ≤ 64 chars, minúsculas/números/guiones, sin `anthropic`/`claude`;
`description` ≤ 1024 chars y es la señal de descubrimiento (qué hace + cuándo usarla).
Conviene una skill **procedimental**: instalar la CLI, init de `docs/artifacts/`,
comandos con flags, convención `index.html`/`content.tsx`, troubleshooting.

### 2.2 Cómo aparece en skills.sh

No hay registro manual: skills.sh indexa repos públicos con `SKILL.md` y el
ranking sale de telemetría anónima de instalaciones del CLI `skills`.
Para verificar compatibilidad local:

```bash
npx skills add ./artifact-cli --list   # debe listar artifact-cli
npx skills add <owner>/<repo> -a claude-code -y
```

Agregar al README el badge:

```
[![skills.sh](https://skills.sh/b/<owner>/<repo>)](https://skills.sh/<owner>/<repo>)
```

## 3. Fase 3 — Landing simple en Vercel

### 3.1 Estructura propuesta (HTML estático, cero build)

```
landing/
├── index.html      # hero, install (npm i -g), comandos, skill, links
├── styles.css
├── vercel.json     # { "$schema": ..., "cleanUrls": true }
└── public/
    └── og.png      # opcional
```

Contenido mínimo: qué es, `npm i -g @tarileo/artifacts-cli`, demo/GIF del dashboard,
`npx skills add leobar37/artifacts-cli`, links a npm/GitHub/skills.sh.

### 3.2 Despliegue

1. Vercel → Add New Project → mismo repo, **Root Directory = `landing/`**, framework *Other*.
2. Deploy automático por push a `main`; preview URLs por PR.
3. Dominio: `artifact-cli.vercel.app` o custom.

### 3.3 Alternativa (descartada por defecto)

Next.js dentro del monorepo: más potencia (docs, playground) pero obliga a build,
rompe la simplicidad y mezcla concerns con la CLI. Solo si la landing crece a docs.

## 4. Orden de implementación y checklist

| # | Tarea | Verifica con |
|---|-------|--------------|
| 1 | `repository` + `publishConfig` + `chmod +x` en `package.json` | `pnpm build && ls -l dist/cli/index.js` |
| 2 | Crear `.github/workflows/publish.yml` (+ workflow `ci.yml` con typecheck/test) | `act` o push a rama + dispatch manual |
| 3 | Primera publicación manual + registrar Trusted Publisher en npm | `npm view @tarileo/artifacts-cli version` |
| 4 | Crear `skills/artifacts-cli/SKILL.md` (+ references) | `npx skills add ./artifacts-cli --list` |
| 5 | Badge skills.sh en README | render del README |
| 6 | Crear `landing/` + conectar proyecto Vercel (Root = `landing/`) | URL pública |

## 5. Tradeoffs asumidos

- **OIDC vs `NPM_TOKEN`**: OIDC elimina el secreto y da provenance gratis; cuesta la
  publicación manual inicial y Node ≥ 22 en CI.
- **Release de GitHub vs changesets**: release manual = menos piezas móviles para v0.x.
- **Landing estática vs framework**: estática = deploy inmediato, sin build; migrar después si hace falta.
- **Skill en el mismo repo**: un solo repo = la skill versiona junto a la CLI y
  skills.sh la descubre vía `npx skills add <owner>/<repo>`; repo separado solo si
  se publican muchas skills no relacionadas.
