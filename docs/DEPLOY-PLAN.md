# Deploy plan: npm + skill (skills.sh) + landing (Vercel)

Date: 2026-09-21. Package: `@tarileo/artifacts-cli` v0.1.0.
Goal: publish the CLI on npm with CI, expose an installable skill via
`npx skills add leobar37/artifacts-cli` (skills.sh compatible), and put up a simple landing page on Vercel.

Sources: [skills.sh docs](https://www.skills.sh/docs) · [`vercel-labs/skills` CLI](https://github.com/vercel-labs/skills) · [npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers/) · [Agent Skills spec](https://github.com/anthropics/skills/blob/main/spec/agent-skills-spec.md).

---

## 0. Prior findings (real blockers)

1. **`package.json` has no `repository` or `publishConfig`.** npm Trusted Publishing
   requires `repository.url` to match the GitHub repo of the workflow exactly.
2. **`dist/` is in `.gitignore` (correct), but the `bin` needs the executable bit.**
   Today `dist/cli/index.js` has `+x`, but `tsc` doesn't preserve the bit: a `dist`
   built in CI comes out without `+x` and the installed binary fails with `EACCES`.
   Add `chmod +x` to the build or the workflow.
3. **No `.github/workflows/`.** Must be created from scratch.
4. **No `skills/`.** skills.sh discovers skills by scanning the repo:
   each skill lives in `skills/<name>/SKILL.md` (the only required file).
   End-user installation: `npx skills add <owner/repo>`.
5. **No landing page.** Simplest option: a `landing/` folder with static HTML
   + `vercel.json`, connected as a separate Vercel project with *Root Directory* = `landing/`.

## 1. Phase 1 — Publish the CLI on npm via GitHub Actions

### 1.1 Changes to `package.json`

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

### 1.2 Workflow `.github/workflows/publish.yml` (recommended: OIDC, no token)

Trigger: published release (`release: types: [published]`) or `v*` tag.
Permissions: `contents: read` + `id-token: write`. Ubuntu runner, Node 22+ (npm ≥ 11.5.1).

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
      # setup-node writes an empty `_authToken=${NODE_AUTH_TOKEN}` and breaks OIDC:
      - run: sed -i '/_authToken/d' "${NPM_CONFIG_USERCONFIG:-$HOME/.npmrc}"
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck
      - run: pnpm run build
      - run: npm publish --access public   # OIDC + automatic provenance
```

Known gotcha (`actions/setup-node#1551`): without the `sed`, npm fails with `ENEEDAUTH`
instead of attempting OIDC.

### 1.3 Manual setup (one time, not automated)

1. Publish a first version manually (`npm publish --access public`) — npm only
   lets you register a *Trusted Publisher* on a package that already exists.
2. On npmjs.com → package → Settings → Trusted Publisher → GitHub Actions:
   owner, repo, workflow `publish.yml` (name only, case-sensitive), environment if applicable.
3. Optional: `npm-publish` environment with required reviewers; restrict to tags/releases.
4. Delete old npm tokens; optionally enable *"Require 2FA and disallow tokens"*
   (Trusted Publishing keeps working because it uses OIDC, not tokens).

### 1.4 Versioning (open decision)

- Simple: manual `version` bump + GitHub Release → triggers the workflow.
- Scalable: `changesets` (automatic release PR). Only recommended if there will be
  frequent releases; for v0.x the manual flow is enough.

## 2. Phase 2 — skills.sh-compatible skill

### 2.1 Structure (portable Agent Skills standard)

```
skills/
└── artifact-cli/
    ├── SKILL.md            # required
    ├── references/
    │   └── commands.md     # optional: command/flag reference
    └── assets/             # optional: logo, examples
```

`SKILL.md` uses **only** portable frontmatter (`name` + `description`; none of
the client-proprietary `allowed-tools`/`model`):

```markdown
---
name: artifact-cli
description: Manage and preview HTML artifacts with the artifact CLI (start, list, stop, reload, --tailscale). Use when working with docs/artifacts, previewing generated HTML artifacts, or exposing the artifact dashboard over Tailscale.
---

# Artifact CLI
...
```

Spec rules: `name` ≤ 64 chars, lowercase/numbers/hyphens, no `anthropic`/`claude`;
`description` ≤ 1024 chars and is the discovery signal (what it does + when to use it).
Conviene una skill **procedimental**: instalar la CLI, init de `docs/artifacts/`,
comandos con flags, convención `index.html`, troubleshooting.

### 2.2 How it shows up on skills.sh

No manual registration: skills.sh indexes public repos with `SKILL.md`, and the
ranking comes from anonymous install telemetry of the `skills` CLI.
To verify compatibility locally:

```bash
npx skills add ./artifact-cli --list   # should list artifact-cli
npx skills add <owner>/<repo> -a claude-code -y
```

Add the badge to the README:

```
[![skills.sh](https://skills.sh/b/<owner>/<repo>)](https://skills.sh/<owner>/<repo>)
```

## 3. Phase 3 — Simple landing page on Vercel

### 3.1 Proposed structure (static HTML, zero build)

```
landing/
├── index.html      # hero, install (npm i -g), commands, skill, links
├── styles.css
├── vercel.json     # { "$schema": ..., "cleanUrls": true }
└── public/
    └── og.png      # optional
```

Minimum content: what it is, `npm i -g @tarileo/artifacts-cli`, dashboard demo/GIF,
`npx skills add leobar37/artifacts-cli`, links to npm/GitHub/skills.sh.

### 3.2 Deployment

1. Vercel → Add New Project → same repo, **Root Directory = `landing/`**, *Other* framework.
2. Automatic deploy on push to `main`; preview URLs per PR.
3. Domain: `artifact-cli.vercel.app` or custom.

### 3.3 Alternative (discarded by default)

Next.js inside the monorepo: more power (docs, playground) but forces a build,
breaks simplicity, and mixes concerns with the CLI. Only if the landing grows into docs.

## 4. Implementation order and checklist

| # | Task | Verify with |
|---|-------|--------------|
| 1 | `repository` + `publishConfig` + `chmod +x` in `package.json` | `pnpm build && ls -l dist/cli/index.js` |
| 2 | Create `.github/workflows/publish.yml` (+ `ci.yml` workflow with typecheck/test) | `act` or push to a branch + manual dispatch |
| 3 | First manual publish + register Trusted Publisher on npm | `npm view @tarileo/artifacts-cli version` |
| 4 | Create `skills/artifacts-cli/SKILL.md` (+ references) | `npx skills add ./artifacts-cli --list` |
| 5 | skills.sh badge in README | README render |
| 6 | Create `landing/` + connect Vercel project (Root = `landing/`) | Public URL |

## 5. Assumed tradeoffs

- **OIDC vs `NPM_TOKEN`**: OIDC removes the secret and gives free provenance; costs the
  initial manual publish and Node ≥ 22 in CI.
- **GitHub Release vs changesets**: manual release = fewer moving parts for v0.x.
- **Static landing vs framework**: static = instant deploy, no build; migrate later if needed.
- **Skill in the same repo**: one repo = the skill versions alongside the CLI and
  skills.sh discovers it via `npx skills add <owner>/<repo>`; a separate repo only if
  publishing many unrelated skills.
