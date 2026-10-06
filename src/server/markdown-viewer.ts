import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Marked, type Tokens } from "marked";
import hljs from "highlight.js/lib/common";
import { findJsxBlock, parseJsxProps, renderMdxComponent, slugifyHeading, EXPAND_BUTTON, type JsxBlock } from "./mdx-components.js";

export type ViewerTheme = "dark" | "light";

export interface MarkdownViewerOptions {
  /** Sidebar/slug label for the top bar. */
  slug: string;
  format: "md" | "mdx";
  theme?: ViewerTheme;
  /** Raw source path relative to the project (for the "raw" link label). */
  relativePath?: string;
}

/**
 * Markdown/MDX viewer: renders the artifact source into a single
 * self-contained HTML page served under the usual preview URL, so the
 * sandboxed iframe, the SSE hot-reload and the broker proxy all keep
 * working without dashboard-side changes.
 *
 * Rendering contract:
 * - GFM (tables, task lists, strikethrough, autolinks) via marked.
 * - Fenced code gets highlight.js; unknown languages stay plain.
 * - YAML frontmatter is stripped (its title feeds the scanner, not the body).
 * - MDX module-level `import`/`export` statements are hidden: they are
 *   compile-time metadata, not content. JSX passes through as inert HTML.
 */
export function renderMarkdownViewer(source: string, options: MarkdownViewerOptions): string {
  const theme = options.theme === "light" ? "light" : "dark";
  const body = renderMarkdownBody(source, options.format);
  // Long documents get quick navigation: headings (including <Section>
  // titles, which render as <h2>) become an index sidebar. Short docs keep
  // the current single-column look untouched.
  const { html: anchored, toc } = addHeadingAnchors(body);
  const withToc = toc.length >= 3;
  const mermaidScript = anchored.includes('class="mv-mermaid"') ? mermaidBootScript() : "";
  const graphScript = anchored.includes('class="mv-graph') ? graphBootScript() : "";
  const content = withToc
    ? `<div class="mv-layout"><nav class="mv-toc" aria-label="Secciones"><p class="mv-toc-title">Secciones</p><ul>${toc
        .map((e) => `<li class="mv-toc-l${e.level}"><a href="#${e.id}">${escapeHtml(e.text)}</a></li>`)
        .join("")}</ul></nav><div class="mv-content">${anchored}</div></div>`
    : `<main class="mv-content">${anchored}</main>`;
  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(options.slug)}</title>
<style>${baseCss(theme)}${hljsCss(theme)}</style>
</head>
<body>
<header class="mv-bar">
  <span class="mv-slug">${escapeHtml(options.slug)}</span>
  <span class="mv-format">${options.format}</span>
  <a class="mv-raw" href="?raw=1" title="${escapeHtml(options.relativePath ?? "raw source")}">raw</a>
  <a class="mv-raw" href="/mdx-guide" target="_blank" title="components you can use inside .mdx artifacts">mdx guide</a>
</header>
${content}
${mermaidScript}
${graphScript}
</body>
</html>`;
}

export interface TocEntry {
  level: 1 | 2 | 3;
  id: string;
  text: string;
}

/** URL-friendly anchor from a heading — shared with <Section> ids. */
export { slugifyHeading };

/**
 * Give every h1-h3 an `id` (authors can jump with `#anchor`) and collect
 * the index entries. Duplicate titles get `-2`, `-3`, ... suffixes.
 */
export function addHeadingAnchors(html: string): { html: string; toc: TocEntry[] } {
  const seen = new Map<string, number>();
  const toc: TocEntry[] = [];
  const anchored = html.replaceAll(
    /<h([123])([^>]*)>([\s\S]*?)<\/h\1>/g,
    (match, level, attrs, inner) => {
      const text = inner.replaceAll(/<[^>]+>/g, "").replaceAll(/&amp;/g, "&").replaceAll(/&lt;/g, "<").replaceAll(/&gt;/g, ">").replaceAll(/&quot;/g, '"').trim();
      const existing = /id="([^"]+)"/.exec(attrs)?.[1];
      let id = existing ?? slugifyHeading(text);
      const count = seen.get(id) ?? 0;
      seen.set(id, count + 1);
      if (count > 0) id = `${id}-${count + 1}`;
      if (!text) return match;
      toc.push({ level: Number(level) as 1 | 2 | 3, id, text: text.slice(0, 120) });
      const withId = existing ? match : `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
      return withId.replaceAll(
        `</h${level}>`,
        `<a class="mv-anchor" href="#${id}" aria-label="Enlace a esta sección">#</a></h${level}>`,
      );
    },
  );
  return { html: anchored, toc };
}

function tocBootScript(): string {
  return `<script>
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll(".mv-toc a"));
  if (!links.length || !("IntersectionObserver" in window)) return;
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
  var current = null;
  var select = function (id) {
    if (current === id) return;
    current = id;
    links.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + id); });
  };
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) select(e.target.id);
    });
  }, { rootMargin: "-20% 0px -65% 0px" });
  Object.keys(byId).forEach(function (id) {
    var h = document.getElementById(id);
    if (h) obs.observe(h);
  });
})();
</script>`;
}

function mermaidBootScript(): string {
  return `<script src="/assets/mermaid.min.js"></script>
<script>
(function () {
  var boot = function () {
    if (!window.mermaid) return; // bundle blocked: source text stays visible
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "neutral",
    });
    mermaid.run({ querySelector: ".mv-mermaid", suppressErrors: true });
  };
  if (window.mermaid) boot();
  else window.addEventListener("load", function () { boot(); });
})();
</script>`;
}
/**
 * Expand overlay for every `.mv-graph` figure (Chart, Svg, mermaid):
 * the button opens a full-viewport layer where the vector graphic scales
 * up; ESC or a click on the backdrop closes it.
 */
function graphBootScript(): string {
  return `<script>
(function () {
  function close() {
    var open = document.querySelector(".mv-graph.open");
    if (open) open.classList.remove("open");
    document.body.classList.remove("mv-lock");
  }
  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest(".mv-expand") : null;
    if (btn) {
      var fig = btn.closest(".mv-graph");
      if (fig) { fig.classList.add("open"); document.body.classList.add("mv-lock"); }
      return;
    }
    if (e.target && e.target.classList && e.target.classList.contains("mv-graph")
      && e.target.classList.contains("open")) close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") close();
  });
})();
</script>`;
}

/** Markdown body shared by the viewer page (also used by tests). */
export function renderMarkdownBody(source: string, format: "md" | "mdx"): string {
  const withoutFrontmatter = splitFrontmatter(source);
  const prepared = format === "mdx" ? prepareMdx(withoutFrontmatter) : withoutFrontmatter;
  return marked.parse(prepared, { async: false });
}

const marked = new Marked({ gfm: true, breaks: false });

marked.use({
  renderer: {
    code({ text, lang }: Tokens.Code): string {
      const language = (lang ?? "").trim().split(/\s+/)[0];
      if (language === "mermaid") {
        // Diagram: mermaid swaps the inner div for an SVG client-side; until
        // then (or when JS/bundle is unavailable) the raw source stays readable.
        // The button survives the swap (sibling, not child) and opens the overlay.
        return `<figure class="mv-graph mv-diagram">${EXPAND_BUTTON}<div class="mv-mermaid">${escapeHtml(text)}</div></figure>`;
      }
      const highlighted = language && hljs.getLanguage(language)
        ? hljs.highlight(text, { language, ignoreIllegals: true }).value
        : escapeHtml(text);
      const cls = language ? ` class="language-${escapeHtml(language)}"` : "";
      return `<pre><code${cls}>${highlighted}</code></pre>`;
    },
  },
});


/**
 * MDX source preparation: module statements and expression comments are
 * metadata (hidden), JSX components become visible placeholders so nothing
 * disappears silently. Runs outside fenced code blocks only.
 */
function prepareMdx(source: string): string {
  const segments = source.split(/(```[\s\S]*?(?:```|$))/g);
  return segments
    .map((segment, i) => (i % 2 === 1 ? segment : enhanceMdxSegment(segment)))
    .join("");
}

function enhanceMdxSegment(segment: string): string {
  const withoutComments = segment.replace(/\{\/\*[\s\S]*?\*\/\}/g, "<!-- mdx comment -->");
  const withoutModuleCode = withoutComments.replace(
    /^[ \t]*(?:import|export)\b[^\n]*$/gm,
    () => "<!-- mdx module statement -->",
  );
  let text = withoutModuleCode;
  let out = "";
  for (;;) {
    const block = findJsxBlock(text);
    if (!block) break;
    out += text.slice(0, block.start) + renderJsxBlock(block);
    text = text.slice(block.end);
  }
  return out + text;
}

function renderJsxBlock(block: JsxBlock): string {
  // Children are markdown: render them (recursively handling nested JSX)
  // instead of passing raw `**bold**` through as literal text.
  const childrenMd =
    block.children && block.children.trim()
      ? marked.parse(prepareMdx(block.children.trim()), { async: false }).trim()
      : "";
  const props = parseJsxProps(block.attrs);
  const rendered = props ? renderMdxComponent(block.tag, props, childrenMd) : null;
  if (rendered) return rendered;
  // Unknown component or non-literal props: visible placeholder, never silent loss.
  const label = escapeHtml(block.selfClosing || !block.children?.trim() ? `<${block.tag} />` : `<${block.tag}>`);
  return childrenMd
    ? `<div class="mv-comp"><span class="mv-comp-tag">${label}</span><div class="mv-comp-body">${childrenMd}</div></div>`
    : `<div class="mv-comp"><span class="mv-comp-tag">${label}</span></div>`;
}

/** Strip leading `---` YAML frontmatter; return the body only. */
function splitFrontmatter(source: string): string {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}


export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

let hljsCssCache: { dark: string; light: string } | null = null;

/** Inline the highlight.js theme pair shipped with the package. */
function hljsCss(theme: ViewerTheme): string {
  if (!hljsCssCache) {
    const require = createRequire(import.meta.url);
    hljsCssCache = {
      dark: readFileSync(require.resolve("highlight.js/styles/github-dark.css"), "utf-8"),
      light: readFileSync(require.resolve("highlight.js/styles/github.css"), "utf-8"),
    };
  }
  return theme === "light" ? hljsCssCache.light : hljsCssCache.dark;
}

function baseCss(theme: ViewerTheme): string {
  const colors =
    theme === "light"
      ? `
        --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --border: #d1d9e0;
        --bar-bg: #f6f8fa; --quote: #59636e; --code-bg: #f6f8fa; --link: #0969da;
        --badge-bg: #ddf4ff; --badge-fg: #0969da; --mark-bg: #fff8c5;`
      : `
        --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --border: #30363d;
        --bar-bg: #161b22; --quote: #9198a1; --code-bg: #161b22; --link: #58a6ff;
        --badge-bg: #122d42; --badge-fg: #58a6ff; --mark-bg: #bb8009;`;
  return `
:root {${colors}
  color-scheme: ${theme};
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.mv-bar {
  position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 10px;
  padding: 8px 20px; background: var(--bar-bg); border-bottom: 1px solid var(--border);
  font-size: 12px; color: var(--muted);
}
.mv-slug { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.mv-format {
  padding: 1px 7px; border-radius: 10px; font-weight: 600; letter-spacing: .03em;
  background: var(--badge-bg); color: var(--badge-fg); text-transform: uppercase; font-size: 10px;
}
.mv-raw { margin-left: auto; color: var(--muted); text-decoration: none; border: 1px solid var(--border); border-radius: 6px; padding: 1px 8px; }
.mv-raw:hover { color: var(--link); border-color: var(--link); }
.mv-content { max-width: 780px; margin: 0 auto; padding: 40px 24px 96px; }
.mv-content > :first-child { margin-top: 0; }
h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin: 1.6em 0 .6em; font-weight: 650; }
h1 { font-size: 1.9em; padding-bottom: .3em; border-bottom: 1px solid var(--border); }
h2 { font-size: 1.45em; padding-bottom: .3em; border-bottom: 1px solid var(--border); }
h3 { font-size: 1.2em; } h4 { font-size: 1em; }
a { color: var(--link); }
p { margin: .8em 0; }
ul, ol { padding-left: 1.6em; }
li + li { margin-top: .25em; }
li > input[type="checkbox"] { margin-right: .45em; }
code, pre, kbd { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .88em; }
:not(pre) > code {
  background: var(--code-bg); padding: .2em .4em; border-radius: 6px;
}
pre {
  background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px;
  padding: 14px 16px; overflow-x: auto; line-height: 1.5;
}
pre code { background: none; padding: 0; font-size: 1em; }
blockquote {
  margin: 1em 0; padding: .1em 1em; color: var(--quote);
  border-left: .25em solid var(--border);
}
table { border-collapse: collapse; margin: 1.2em 0; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--border); padding: 6px 13px; }
th { background: var(--code-bg); font-weight: 650; }
tr:nth-child(2n) td { background: color-mix(in srgb, var(--code-bg) 55%, transparent); }
hr { border: 0; border-top: 1px solid var(--border); margin: 2em 0; }
img { max-width: 100%; }
mark { background: var(--mark-bg); color: var(--fg); border-radius: 3px; padding: 0 3px; }
.mv-comp {
  margin: 1.2em 0; padding: 10px 14px; border: 1px dashed var(--border);
  border-radius: 8px; background: color-mix(in srgb, var(--code-bg) 45%, transparent);
}
.mv-comp-tag {
  display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .78em; color: var(--muted); background: var(--code-bg);
  border: 1px solid var(--border); border-radius: 6px; padding: 1px 7px; margin-bottom: 4px;
}
.mv-comp-body > :first-child { margin-top: .4em; }
.mv-comp-body > :last-child { margin-bottom: 0; }
.mv-chart { margin: 1.4em 0; overflow-x: auto; }
.mv-chart-title { margin: 0 0 .4em; font-size: .85em; font-weight: 650; color: var(--muted); }
.mv-chart svg { display: block; max-width: 100%; }
.mv-callout { margin: 1.2em 0; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--ca-border); background: var(--ca-bg); }
.mv-callout-title { margin: 0 0 .3em; font-weight: 650; font-size: .92em; color: var(--ca-fg); }
.mv-callout-body > :last-child { margin-bottom: 0; }
.mv-callout-body > :first-child { margin-top: 0; }
.mv-callout--info    { --ca-border: #1f6feb66; --ca-bg: #122d4255; --ca-fg: #58a6ff; }
.mv-callout--warning { --ca-border: #9e6a0366; --ca-bg: #28221555; --ca-fg: #d29922; }
.mv-callout--success { --ca-border: #23863666; --ca-bg: #12261e55; --ca-fg: #3fb950; }
.mv-callout--danger  { --ca-border: #da363366; --ca-bg: #2d151755; --ca-fg: #f85149; }
.mv-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 1.4em 0; }
.mv-stat {
  display: flex; flex-direction: column; gap: 2px; padding: 12px 14px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--code-bg);
}
.mv-stat-value { font-size: 1.45em; font-weight: 700; letter-spacing: -.01em; }
.mv-stat-label { font-size: .78em; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.mv-stat-delta { font-size: .8em; font-weight: 600; }
.mv-stat-delta--up { color: #3fb950; }
.mv-stat-delta--down { color: #f85149; }
.mv-mermaid {
  margin: 1.4em 0; padding: 14px 16px; text-align: center; overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em;
  white-space: pre; background: var(--code-bg); border: 1px solid var(--border);
  border-radius: 8px; color: var(--fg);
}
.mv-mermaid svg { max-width: 100%; height: auto; white-space: normal; }
.mv-frame {
  margin: 1.4em 0; border: 1px solid var(--border); border-radius: 10px;
  overflow: hidden; background: var(--code-bg);
}
.mv-frame-bar {
  display: flex; align-items: center; gap: 6px; padding: 7px 10px;
  border-bottom: 1px solid var(--border); background: var(--bar-bg);
}
.mv-frame-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--border); flex: none; }
.mv-frame-url {
  margin-left: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .72em; color: var(--muted); background: var(--bg);
  border: 1px solid var(--border); border-radius: 6px; padding: 1px 8px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mv-frame-body { display: block; width: 100%; border: 0; background: #fff; }
.mv-content h1[id], .mv-content h2[id], .mv-content h3[id] { scroll-margin-top: 56px; }
.mv-anchor {
  margin-left: .4em; font-size: .7em; font-weight: 400; text-decoration: none;
  color: var(--muted); opacity: 0;
}
h1:hover .mv-anchor, h2:hover .mv-anchor, h3:hover .mv-anchor { opacity: 1; }
.mv-anchor:hover { color: var(--link); }
.mv-layout { display: flex; gap: 32px; max-width: 1120px; margin: 0 auto; padding: 0 24px; align-items: flex-start; }
.mv-layout .mv-content { flex: 1; min-width: 0; max-width: 780px; margin: 0; padding-left: 0; padding-right: 0; }
.mv-toc {
  position: sticky; top: 56px; flex: none; width: 232px; max-height: calc(100vh - 96px);
  overflow-y: auto; margin: 40px 0 96px; padding: 12px 14px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--bar-bg);
  font-size: .82em;
}
.mv-toc-title { margin: 0 0 6px; font-weight: 700; font-size: .78em; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.mv-toc ul { list-style: none; margin: 0; padding: 0; }
.mv-toc li { margin: 0; }
.mv-toc a {
  display: block; padding: 3px 8px; border-radius: 6px; color: var(--muted);
  text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mv-toc a:hover { color: var(--fg); background: var(--code-bg); }
.mv-toc a.active { color: var(--link); background: var(--badge-bg); font-weight: 600; }
.mv-toc-l2 a { padding-left: 8px; }
.mv-toc-l3 a { padding-left: 20px; font-size: .92em; }
.mv-toc-l1 a { font-weight: 600; }
@media (max-width: 900px) {
  .mv-layout { flex-direction: column; gap: 0; }
  .mv-toc { position: static; width: auto; max-height: 190px; margin: 16px 0 0; }
  .mv-layout .mv-content { padding-top: 16px; }
}
.mv-section {
  margin: 1.6em 0; padding: 16px 20px; border: 1px solid var(--border);
  border-radius: 12px; background: color-mix(in srgb, var(--code-bg) 45%, transparent);
}
.mv-section > h2:first-child { margin-top: 0; border-bottom: 0; padding-bottom: 0; }
.mv-section-sub { margin: -.3em 0 .8em; color: var(--muted); font-size: .92em; }
.mv-section-body > :last-child { margin-bottom: 0; }
.mv-svg { margin: 1.4em 0; overflow-x: auto; }
.mv-svg svg { display: block; width: 100%; height: auto; }
.mv-svg text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
.mv-svg-label { fill: var(--fg); font-size: 13px; font-weight: 600; }
.mv-svg-sub { fill: var(--muted); font-size: 11px; }
.mv-svg-tag { fill: var(--muted); font-size: 11px; }
.mv-graph { position: relative; }
.mv-expand {
  position: absolute; top: 8px; right: 8px; width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px; border: 1px solid var(--border); background: var(--bar-bg);
  color: var(--muted); cursor: pointer; font-size: 14px; line-height: 1; opacity: 0;
}
.mv-graph:hover .mv-expand, .mv-expand:focus-visible { opacity: 1; }
.mv-expand:hover { color: var(--link); border-color: var(--link); }
.mv-graph.open {
  position: fixed; inset: 20px; z-index: 60; overflow: auto; margin: 0;
  background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
  padding: 40px 32px;
}
.mv-graph.open .mv-expand { opacity: 1; top: 12px; right: 12px; }
.mv-graph.open .mv-expand span { display: none; }
.mv-graph.open .mv-expand::after { content: "✕"; }
.mv-graph.open svg { width: 100% !important; max-width: 1100px !important; height: auto !important; margin: 0 auto; }
body.mv-lock { overflow: hidden; }
@media (max-width: 900px) {
  .mv-expand { opacity: 1; }
  .mv-graph.open { inset: 8px; padding: 32px 12px; }
}
`;
}

let guideCache: string | null = null;

/** Source of the MDX guide shipped with the package (dist/server/mdx-guide.mdx). */
export function getMdxGuideSource(): string {
  if (!guideCache) {
    guideCache = readFileSync(new URL("./mdx-guide.mdx", import.meta.url), "utf-8");
  }
  return guideCache;
}

/**
 * Tiny wireframe-style page so the guide can show a live <Webframe> demo
 * (the guide is not a docs/artifacts folder, so it ships its own asset).
 */
export function mdxGuideFrameDemo(): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><style>
  body { margin: 0; font: 14px/1.5 -apple-system, sans-serif; color: #1f2328; }
  .app { display: grid; grid-template-columns: 200px 1fr; min-height: 320px; }
  .side { background: #f6f8fa; border-right: 1px solid #d1d9e0; padding: 16px; }
  .main { padding: 24px; }
  .box { border: 1px dashed #9198a1; border-radius: 8px; padding: 12px; margin-bottom: 12px; color: #59636e; }
</style></head>
<body><div class="app">
  <div class="side"><strong>wireframe.html</strong><div class="box">nav</div><div class="box">filters</div></div>
  <div class="main"><div class="box">header — hero copy</div><div class="box">grid of cards</div><div class="box">footer</div></div>
</div></body></html>`;
}

let mermaidCache: Buffer | null = null;

/**
 * UMD bundle for client-side mermaid rendering, served by daemon and broker
 * at /assets/mermaid.min.js (same origin as the viewer page). Long-cached:
 * the file is fixed per installed version.
 */
export function serveMermaidAsset(): Response {
  if (!mermaidCache) {
    const require = createRequire(import.meta.url);
    mermaidCache = readFileSync(require.resolve("mermaid/dist/mermaid.min.js"));
  }
  return new Response(new Uint8Array(mermaidCache), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
