/**
 * Seed preview data for visual checks before deploying.
 *
 *   bun run mock
 *   ARTIFACT_DIR=/tmp/artifact-mock/home artifact start --port 7042
 *
 * Creates three projects under /tmp/artifact-mock with representative
 * artifacts (long titles, all three types, spread dates/sizes, one empty
 * project). ARTIFACT_DIR keeps the real ~/.artifact untouched.
 */
import { mkdirSync, rmSync, writeFileSync, utimesSync } from "fs";
import path from "path";
import { registerProject } from "../src/utils/projects.js";

const ROOT = "/tmp/artifact-mock";
process.env.ARTIFACT_DIR = path.join(ROOT, "home");

interface Seed {
  slug: string;
  title: string;
  type: "generic" | "study" | "wireframe";
  body: string;
  daysAgo: number;
}

function html(title: string, type: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="artifact-type" content="${type}" />
  <title>${title}</title>
</head>
<body>${body}</body>
</html>
`;
}

const SHOP_SEEDS: Seed[] = [
  { slug: "molly-flyers", title: "Molly · Flyers de inauguración", type: "study", body: "<h1>Molly</h1>", daysAgo: 0 },
  { slug: "molly-identidad", title: "Molly — identidad corregida", type: "study", body: "<h1>ID</h1>", daysAgo: 0 },
  {
    slug: "molly-preset",
    title: "Molly Discoteca — Preset video + flyers · Cutervo",
    type: "study",
    body: "<h1>Preset</h1>",
    daysAgo: 0,
  },
  { slug: "omp-control", title: "El trabajo tiene identidad — Control e IDs de OMP", type: "study", body: "<h1>OMP</h1>", daysAgo: 0 },
  { slug: "pestana-videos", title: "Una pestaña. Varios videos. — Orquestador OMP", type: "wireframe", body: "<h1>Wire</h1>", daysAgo: 0 },
  { slug: "eval-voltagent", title: "Eval en VoltAgent — Sistema de Evaluación de Agentes AI", type: "generic", body: "<h1>Eval</h1>", daysAgo: 3 },
  { slug: "alibaba-streaming", title: "Alibaba Streaming Internals - LanguageModelV4", type: "generic", body: "<h1>Stream</h1>", daysAgo: 3 },
  {
    slug: "titulo-larguisimo",
    title: "Este es un título exageradamente largo para ver cómo trunca la sidebar en dos líneas sin romper el layout del card",
    type: "generic",
    body: "<h1>Long</h1>",
    daysAgo: 5,
  },
];

const BLOG_SEEDS: Seed[] = [
  { slug: "hola-mundo", title: "Hola mundo", type: "generic", body: "<h1>Hola</h1>", daysAgo: 1 },
  { slug: "wire-ejemplo", title: "Wire de ejemplo", type: "wireframe", body: "<h1>Wire</h1>", daysAgo: 10 },
];

function seedProject(name: string, seeds: Seed[]): string {
  const dir = path.join(ROOT, name);
  const base = path.join(dir, "docs", "artifacts");
  mkdirSync(base, { recursive: true });
  for (const seed of seeds) {
    const slugDir = path.join(base, seed.slug);
    mkdirSync(slugDir, { recursive: true });
    const file = path.join(slugDir, "index.html");
    writeFileSync(file, html(seed.title, seed.type, seed.body));
    const mtime = new Date(Date.now() - seed.daysAgo * 86400000);
    utimesSync(file, mtime, mtime);
  }
  return dir;
}

rmSync(ROOT, { recursive: true, force: true });

const shop = seedProject("shop", SHOP_SEEDS);
const blog = seedProject("blog", BLOG_SEEDS);
const emptyDir = path.join(ROOT, "empty");
mkdirSync(path.join(emptyDir, "docs", "artifacts"), { recursive: true });

const entries = [shop, blog, emptyDir].map((dir) => registerProject(dir));

console.log("Mock projects seeded under /tmp/artifact-mock:");
for (const entry of entries) {
  console.log(`  ${entry.name}  ${entry.projectPath}  (${entry.projectId})`);
}
console.log("");
console.log("Preview them with:");
console.log("  ARTIFACT_DIR=/tmp/artifact-mock/home artifact start --port 7042");
console.log("");
console.log("Visual checklist: overview grouping, switcher, viewer load/timeout");
console.log("(stop the daemon, then rm -rf /tmp/artifact-mock to clean up).");
