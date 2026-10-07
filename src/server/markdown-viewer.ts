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
 *   compile-time metadata, not content. Built-in components (Chart, Stats,
 *   Callout, Section, Svg, Video, Audio, Webframe) render for real when
 *   props are literals; unknown components become visible placeholders;
 *   lowercase HTML passes through untouched.
 */
export function renderMarkdownViewer(source: string, options: MarkdownViewerOptions): string {
  const theme = options.theme === "light" ? "light" : "dark";
  const body = renderMarkdownBody(source, options.format);
  // Long documents get quick navigation: headings (including <Section>
  // titles, which render as <h2>) become an index sidebar. Short docs keep
  // the current single-column look untouched.
  const { html: anchored, toc } = addHeadingAnchors(body);
  const withToc = toc.length >= 3;
  const tocScript = withToc ? tocBootScript() : "";
  const mermaidScript = anchored.includes('class="mv-mermaid"') ? mermaidBootScript() : "";
  const graphScript = anchored.includes('class="mv-graph') ? graphBootScript() : "";
  const dataScript = anchored.includes('class="mv-data mv-data-src"') ? dataBootScript() : "";
  const content = withToc
    ? `<div class="mv-layout"><nav class="mv-toc" aria-label="Secciones"><p class="mv-toc-title">Secciones</p><input class="mv-toc-search" type="search" placeholder="Filtrar secciones…" aria-label="Filtrar secciones" autocomplete="off"><ul>${toc
        .map((e) => `<li class="mv-toc-l${e.level}"><a href="#${e.id}">${escapeHtml(e.text)}</a></li>`)
        .join("")}<li class="mv-toc-empty" hidden>Sin coincidencias</li></ul></nav><div class="mv-content">${anchored}</div></div>`
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
${tocScript}
${mermaidScript}
${graphScript}
${dataScript}
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
      const withId =
        existing && count === 0
          ? match
          : (existing ? match.replace(/id="[^"]*"/, `id="${id}"`) : `<h${level}${attrs} id="${id}">${inner}</h${level}>`);
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
  var nav = document.querySelector(".mv-toc");
  if (!nav) return;
  var links = Array.prototype.slice.call(nav.querySelectorAll("li a"));
  if (!links.length) return;
  var norm = function (s) { return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); };
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
  var current = null;
  var select = function (id) {
    if (current === id) return;
    current = id;
    links.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + id); });
  };
  var box = nav.querySelector(".mv-toc-search");
  var empty = nav.querySelector(".mv-toc-empty");
  if (box) {
    box.addEventListener("input", function () {
      var q = norm(box.value.trim());
      var visible = 0;
      links.forEach(function (a) {
        var hit = !q || norm(a.textContent).indexOf(q) !== -1;
        a.parentElement.hidden = !hit;
        if (hit) {
          visible++;
        } else {
          a.classList.remove("active");
          if (current === a.getAttribute("href").slice(1)) current = null;
        }
      });
      if (empty) empty.hidden = visible !== 0;
    });
  }
  if (!("IntersectionObserver" in window)) return;
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting && byId[e.target.id] && !byId[e.target.id].parentElement.hidden) select(e.target.id);
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

/**
 * Hydration for `.mv-data-src` placeholders (TaskList/Kanban/Properties with
 * a sibling JSON `src`). Mirrors the boundary rules of
 * data-components-runtime.ts (which cannot be imported client-side): the
 * source must be a safe relative .json path resolving inside the current
 * document's artifact namespace on the same origin, redirects may not escape
 * that boundary, the response is byte-capped at 1 MiB even without
 * Content-Length, JSON is parsed without evaluation, and the DOM is built
 * with createElement/textContent only. No Authorization header is ever sent
 * (fetch defaults to same-origin credentials for cookies only). Same-src
 * loads are deduplicated per boot via a fresh Map, so a viewer reload never
 * reuses stale data.
 */
function dataBootScript(): string {
  return `<script>
(function () {
  var MAX_BYTES = 1048576;
  var MAX_ITEMS = 1000;
  var MAX_COLUMNS = 50;
  var MAX_ENTRIES = 100;
  var nodes = Array.prototype.slice.call(document.querySelectorAll(".mv-data-src"));
  if (!nodes.length) return;
  var cache = new Map(); // resolved href -> Promise; fresh per boot (reload re-runs this script)

  // Artifact namespace prefix of the current page: /p/:project/:slug or
  // /r/:remote/p/:project/:slug, where :slug is the first segment after the
  // reserved "artifacts" segment (omitted segment tolerated). Null when the
  // page is not inside a known artifact family.
  function prefixOf(pathname) {
    var segs = pathname.split("/");
    var i;
    if (segs[1] === "p") i = 2;
    else if (segs[1] === "r" && segs[3] === "p") i = 4;
    else return null;
    var parts = segs.slice(0, i + 1);
    if (segs[i + 1] === "artifacts") {
      if (!segs[i + 2]) return null;
      parts.push("artifacts", segs[i + 2]);
    } else {
      if (!segs[i + 1]) return null;
      parts.push(segs[i + 1]);
    }
    return parts.join("/") || null;
  }
  var prefix = prefixOf(location.pathname);

  function decode(value) {
    try { return decodeURIComponent(value); } catch (err) { return null; }
  }

  function hasControlChars(value) {
    return /[\\u0000-\\u001f\\u007f-\\u009f]/.test(value);
  }

  // Client-side mirror of the server's isSafeSrc (defense in depth: the
  // server only emits placeholders for safe src values). One decode round is
  // sufficient here because the browser URL parser keeps %2e%2e encoded, so
  // encoded traversal cannot escape client-side either.
  function safeSrc(src) {
    if (typeof src !== "string" || src === "" || src.length > 512) return false;
    var dec = decode(src);
    if (dec === null || !/\\.json$/.test(dec)) return false;
    if (hasControlChars(src) || hasControlChars(dec)) return false;
    if (src.indexOf("\\\\") !== -1 || src.indexOf("?") !== -1 || src.indexOf("#") !== -1) return false;
    if (src.charAt(0) === "/" || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(src)) return false;
    var parts = dec.split("/");
    for (var i = 0; i < parts.length; i++) { if (parts[i] === "..") return false; }
    return true;
  }

  // Client-side mirror of isSafeHref: relative sibling paths and in-document
  // fragments only. Item links stay document-relative so the browser (not
  // this script) resolves them against the current page.
  function safeHref(href) {
    if (typeof href !== "string" || href === "") return false;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) return false;
    if (href.charAt(0) === "/" || href.indexOf("//") === 0 || href.indexOf("\\\\") !== -1 || href.indexOf("?") !== -1) return false;
    var dec = decode(href);
    if (dec === null || hasControlChars(dec) || dec.indexOf("\\\\") !== -1 || dec.indexOf("?") !== -1) return false;
    var parts = dec.split("#")[0].split("/");
    for (var i = 0; i < parts.length; i++) { if (parts[i] === "..") return false; }
    return true;
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function fail(el, kind, message) {
    clear(el);
    var box = document.createElement("div");
    box.className = "mv-data-error";
    box.setAttribute("role", "alert");
    var head = document.createElement("p");
    head.className = "mv-data-error-title";
    head.textContent = kind + ": data could not be loaded";
    var list = document.createElement("ul");
    list.className = "mv-data-error-list";
    var item = document.createElement("li");
    item.textContent = message;
    list.appendChild(item);
    box.appendChild(head);
    box.appendChild(list);
    el.appendChild(box);
  }

  // Bounded body read: pre-check Content-Length when present, then stream
  // with a running byte cap so oversized payloads abort even when the length
  // is unknown or untrustworthy.
  function loadText(url) {
    return fetch(url, { redirect: "follow", credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error("the data source answered HTTP " + res.status);
      if (blockedUrl(res.url)) throw new Error("the data source redirected outside the artifact boundary");
      var declared = res.headers.get("content-length");
      if (declared !== null && Number(declared) > MAX_BYTES) throw new Error("the data source exceeds the 1 MiB byte cap");
      if (!res.body || !res.body.getReader) {
        return res.text().then(function (text) {
          if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error("the data source exceeds the 1 MiB byte cap");
          return text;
        });
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder("utf-8");
      var total = 0;
      var text = "";
      function pump() {
        return reader.read().then(function (next) {
          if (next.done) { text += decoder.decode(); return text; }
          total += next.value.byteLength;
          if (total > MAX_BYTES) {
            try { reader.cancel(); } catch (err) { /* already closed */ }
            throw new Error("the data source exceeds the 1 MiB byte cap");
          }
          text += decoder.decode(next.value, { stream: true });
          return pump();
        });
      }
      return pump();
    });
  }

  function blockedUrl(candidate) {
    try {
      var url = new URL(candidate, location.href);
      if (url.origin !== location.origin) return true;
      if (prefix === null) return true;
      return url.pathname !== prefix && url.pathname.indexOf(prefix + "/") !== 0;
    } catch (err) {
      return true;
    }
  }

  // Minimal shape check (server renderers validate fully; hydration only
  // needs the version, the arrays it renders, and the display caps).
  function shapeProblem(kind, data) {
    if (data === null || typeof data !== "object" || Array.isArray(data)) return "the dataset must be a JSON object";
    if (data.version !== 1) return "unsupported dataset version (expected version 1)";
    if (kind === "properties") {
      if (!Array.isArray(data.entries)) return "entries must be an array";
      if (data.entries.length > MAX_ENTRIES) return "the dataset has more than " + MAX_ENTRIES + " entries";
      return null;
    }
    if (!Array.isArray(data.items)) return "items must be an array";
    if (data.items.length > MAX_ITEMS) return "the dataset has more than " + MAX_ITEMS + " items";
    if (kind === "kanban") {
      if (!Array.isArray(data.columns)) return "columns must be an array";
      if (data.columns.length > MAX_COLUMNS) return "the dataset has more than " + MAX_COLUMNS + " columns";
    }
    return null;
  }

  function text(value) {
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
  }

  function workItem(raw) {
    var item = raw && typeof raw === "object" ? raw : {};
    var li = document.createElement("li");
    li.className = "mv-task";
    var head = document.createElement("div");
    head.className = "mv-task-head";
    var badge = document.createElement("span");
    badge.className = "mv-badge";
    badge.textContent = text(item.status);
    head.appendChild(badge);
    var href = typeof item.href === "string" && safeHref(item.href) ? item.href : null;
    var title = document.createElement(href ? "a" : "span");
    title.className = "mv-task-title";
    if (href) title.setAttribute("href", href);
    title.textContent = text(item.title);
    head.appendChild(title);
    if (typeof item.owner === "string" && item.owner) {
      var owner = document.createElement("span");
      owner.className = "mv-task-owner";
      owner.textContent = item.owner;
      head.appendChild(owner);
    }
    li.appendChild(head);
    if (typeof item.description === "string" && item.description) {
      var desc = document.createElement("p");
      desc.className = "mv-task-desc";
      desc.textContent = item.description;
      li.appendChild(desc);
    }
    return li;
  }

  function appendTitle(section, title) {
    if (!title) return;
    var p = document.createElement("p");
    p.className = "mv-data-title";
    p.textContent = title;
    section.appendChild(p);
  }

  function appendEmpty(section, message) {
    var empty = document.createElement("div");
    empty.className = "mv-data-empty";
    empty.textContent = message;
    section.appendChild(empty);
  }

  // Flat task list preserving item order (grouped rendering needs the
  // groupBy prop, which is not carried on the placeholder attributes).
  function buildTaskList(data, title) {
    var section = document.createElement("section");
    section.className = "mv-data mv-tasklist";
    appendTitle(section, title);
    if (!data.items.length) { appendEmpty(section, "No items in this task list."); return section; }
    var ul = document.createElement("ul");
    ul.className = "mv-tasklist-items";
    for (var i = 0; i < data.items.length; i++) ul.appendChild(workItem(data.items[i]));
    section.appendChild(ul);
    return section;
  }

  function buildKanban(data, title) {
    var section = document.createElement("section");
    section.className = "mv-data mv-kanban";
    appendTitle(section, title);
    if (!data.columns.length) { appendEmpty(section, "This board has no columns and no items."); return section; }
    var wrap = document.createElement("div");
    wrap.className = "mv-kanban-columns";
    for (var c = 0; c < data.columns.length; c++) {
      var col = data.columns[c] && typeof data.columns[c] === "object" ? data.columns[c] : {};
      var inColumn = data.items.filter(function (item) {
        return item && typeof item === "object" && item.status === col.id;
      });
      var colEl = document.createElement("div");
      colEl.className = "mv-kanban-col";
      var label = document.createElement("p");
      label.className = "mv-kanban-col-label";
      label.textContent = text(col.label);
      var count = document.createElement("span");
      count.className = "mv-kanban-count";
      count.textContent = String(inColumn.length);
      label.appendChild(count);
      colEl.appendChild(label);
      if (inColumn.length) {
        var ul = document.createElement("ul");
        ul.className = "mv-kanban-items";
        for (var i = 0; i < inColumn.length; i++) ul.appendChild(workItem(inColumn[i]));
        colEl.appendChild(ul);
      } else {
        var none = document.createElement("p");
        none.className = "mv-kanban-empty";
        none.textContent = "No items";
        colEl.appendChild(none);
      }
      wrap.appendChild(colEl);
    }
    section.appendChild(wrap);
    return section;
  }

  // Flat labeled-value list; section grouping stays a server-renderer
  // feature (literal data), hydration keeps the flat class-compatible form.
  function buildProperties(data, title) {
    var section = document.createElement("section");
    section.className = "mv-data mv-properties";
    appendTitle(section, title);
    if (!data.entries.length) { appendEmpty(section, "No properties in this dataset."); return section; }
    var dl = document.createElement("dl");
    dl.className = "mv-props";
    for (var i = 0; i < data.entries.length; i++) {
      var entry = data.entries[i] && typeof data.entries[i] === "object" ? data.entries[i] : {};
      var row = document.createElement("div");
      row.className = "mv-prop";
      var dt = document.createElement("dt");
      dt.textContent = text(entry.label);
      var dd = document.createElement("dd");
      var value = entry.value;
      dd.textContent = value === null || value === undefined ? "null" : typeof value === "object" ? "" : String(value);
      row.appendChild(dt);
      row.appendChild(dd);
      dl.appendChild(row);
    }
    section.appendChild(dl);
    return section;
  }

  function mvHydrateDataSrc(el) {
    var kind = el.getAttribute("data-kind") || "";
    var src = el.getAttribute("data-src") || "";
    var title = el.getAttribute("data-title") || "";
    var label = kind === "tasklist" ? "TaskList" : kind === "kanban" ? "Kanban" : kind === "properties" ? "Properties" : kind || "Data view";
    var problem = null;
    if (prefix === null) problem = "this page is outside the artifact URL namespace";
    else if (!safeSrc(src)) problem = "src must be a relative .json path (no scheme, absolute form, traversal, query or fragment)";
    var url = problem ? null : new URL(src, document.baseURI);
    if (!problem && url.origin !== location.origin) problem = "the data source is cross-origin";
    if (!problem && url.pathname !== prefix && url.pathname.indexOf(prefix + "/") !== 0) problem = "the data source escapes the artifact boundary";
    if (problem) { fail(el, label, problem); return; }
    var pending = cache.get(url.href);
    if (!pending) {
      pending = loadText(url.href).then(function (body) {
        try { return JSON.parse(body); } catch (err) { throw new Error("the data source is not valid JSON"); }
      });
      cache.set(url.href, pending);
    }
    pending.then(function (data) {
      var shape = shapeProblem(kind, data);
      if (shape) { fail(el, label, shape); return; }
      clear(el);
      el.appendChild(kind === "properties" ? buildProperties(data, title) : kind === "kanban" ? buildKanban(data, title) : buildTaskList(data, title));
    }, function (err) {
      fail(el, label, err && err.message ? err.message : "the data source could not be loaded");
    });
  }

  for (var n = 0; n < nodes.length; n++) mvHydrateDataSrc(nodes[n]);
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
video { max-width: 100%; }
.mv-media { margin: 1.4em 0; }
.mv-video { display: block; width: 100%; max-height: 480px; background: #000; border: 1px solid var(--border); border-radius: 10px; }
.mv-audio { display: block; width: 100%; }
.mv-media--audio { padding: 10px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--code-bg); }
.mv-media-cap { display: block; margin-top: .4em; font-size: .85em; color: var(--muted); }
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
  position: sticky; top: 56px; flex: none; width: 248px; max-height: calc(100vh - 96px);
  display: flex; flex-direction: column;
  margin: 40px 0 96px; padding: 14px 12px 10px;
  border: 1px solid var(--border); border-radius: 12px; background: var(--bar-bg);
  font-size: .84em;
}
.mv-toc-title { margin: 0 4px 8px; font-weight: 700; font-size: .74em; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.mv-toc-search {
  margin: 0 0 8px; padding: 6px 10px; width: 100%;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg); color: var(--fg); font-size: .86em; outline: none;
}
.mv-toc-search::placeholder { color: var(--muted); }
.mv-toc-search:focus { border-color: var(--link); }
.mv-toc-search::-webkit-search-cancel-button { cursor: pointer; }
.mv-toc ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; min-height: 0; }
.mv-toc ul::-webkit-scrollbar { width: 8px; }
.mv-toc ul::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
.mv-toc ul::-webkit-scrollbar-track { background: transparent; }
.mv-toc li { margin: 0; }
.mv-toc a {
  display: block; padding: 4px 10px; border-radius: 7px; color: var(--muted);
  text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mv-toc a:hover { color: var(--fg); background: var(--code-bg); }
.mv-toc a.active { color: var(--link); background: var(--badge-bg); font-weight: 600; }
.mv-toc-l1 a { font-weight: 600; color: var(--fg); }
.mv-toc-l2 a { padding-left: 10px; }
.mv-toc-l3 a { padding-left: 22px; font-size: .92em; }
.mv-toc-empty { padding: 8px 10px; color: var(--muted); font-size: .86em; }
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
/* --- JSON-backed data views (TaskList / Kanban / Properties) --- */
.mv-data { margin: 1.4em 0; }
.mv-data-title { margin: 0 0 .5em; font-size: .85em; font-weight: 650; color: var(--muted); }
.mv-data-error {
  margin: 1.2em 0; padding: 12px 16px; border: 1px solid #da363366; border-radius: 10px;
  background: color-mix(in srgb, #f85149 8%, var(--bg));
}
.mv-data-error-title { margin: 0 0 .35em; font-weight: 650; font-size: .92em; color: #f85149; }
.mv-data-error-list { margin: 0; padding-left: 1.2em; }
.mv-data-error-list li { font-size: .85em; overflow-wrap: anywhere; }
.mv-data-empty {
  margin: .6em 0; padding: 14px 16px; border: 1px dashed var(--border); border-radius: 10px;
  color: var(--muted); font-size: .9em;
  background: color-mix(in srgb, var(--code-bg) 45%, transparent);
}
.mv-data-group + .mv-data-group { margin-top: 1.1em; }
.mv-data-group-label {
  margin: 0 0 .45em; font-size: .74em; font-weight: 700; text-transform: uppercase;
  letter-spacing: .07em; color: var(--muted);
}
.mv-tasklist-items, .mv-kanban-items { list-style: none; margin: 0; padding: 0; }
.mv-tasklist-items > li + li, .mv-kanban-items > li + li { margin-top: 8px; }
.mv-task {
  min-width: 0; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px;
  background: color-mix(in srgb, var(--code-bg) 55%, transparent);
}
.mv-task-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.mv-badge {
  flex: none; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--badge-fg);
  background: var(--badge-bg); color: var(--badge-fg); font-size: .72em; font-weight: 650;
  letter-spacing: .02em; white-space: nowrap;
}
.mv-task-title { font-weight: 600; color: var(--fg); overflow-wrap: anywhere; }
a.mv-task-title { color: var(--link); text-decoration: none; }
a.mv-task-title:hover { text-decoration: underline; }
.mv-task-owner {
  flex: none; font-size: .78em; color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mv-task-desc { margin: .35em 0 0; font-size: .86em; overflow-wrap: anywhere; }
.mv-task-href-note { font-size: .74em; color: var(--muted); font-style: italic; }
.mv-kanban-columns {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px; align-items: start;
}
.mv-kanban-col {
  min-width: 0; padding: 10px; border: 1px solid var(--border); border-radius: 10px;
  background: color-mix(in srgb, var(--bar-bg) 60%, transparent);
}
.mv-kanban-col-label { display: flex; align-items: center; gap: 8px; margin: 0 0 .5em; font-weight: 650; font-size: .88em; }
.mv-kanban-count {
  padding: 0 7px; border-radius: 999px; background: var(--badge-bg); color: var(--badge-fg);
  font-size: .72em; font-weight: 650;
}
.mv-kanban-empty { margin: .2em 0 0; font-size: .82em; color: var(--muted); font-style: italic; }
.mv-props { margin: .4em 0 0; }
.mv-prop {
  display: grid; grid-template-columns: minmax(130px, 32%) 1fr; gap: 4px 16px;
  padding: 7px 0; border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
}
.mv-prop:last-child { border-bottom: 0; }
.mv-prop dt { color: var(--muted); font-weight: 600; font-size: .88em; overflow-wrap: anywhere; }
.mv-prop dd { margin: 0; font-size: .94em; overflow-wrap: anywhere; }
.mv-data-src {
  padding: 12px 16px; border: 1px dashed var(--border); border-radius: 10px;
  background: color-mix(in srgb, var(--code-bg) 45%, transparent);
}
.mv-data-loading, .mv-data-noscript { margin: 0; color: var(--muted); font-size: .88em; }
.mv-data a:focus-visible { outline: 2px solid var(--link); outline-offset: 2px; border-radius: 4px; }
@media (max-width: 390px) {
  .mv-kanban-columns { grid-template-columns: 1fr; }
  .mv-prop { grid-template-columns: 1fr; }
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
