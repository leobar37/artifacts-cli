import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Built-in MDX component runtime for the markdown viewer.
 *
 * Contract (documented in /mdx-guide):
 * - Only block-level JSX at the start of a line, component style
 *   (capitalized tag). Lowercase HTML stays markdown's business.
 * - Props must be literals: strings, numbers, booleans or JSON-ish arrays
 *   and objects (unquoted keys/single quotes tolerated). Identifiers like
 *   `data={sales}` cannot resolve in a viewer that executes no code —
 *   inline your data instead.
 * - Children of container components are processed as markdown by the
 *   viewer before reaching here.
 * - Unknown components keep the visible placeholder treatment.
 */

export interface JsxBlock {
  tag: string;
  attrs: string;
  children: string | null;
  selfClosing: boolean;
  start: number;
  end: number;
}

const OPEN_TAG = /^([ \t]*)<([A-Z][A-Za-z0-9]*)/gm;

interface TagEnd {
  end: number;
  selfClosing: boolean;
}

/** Scan from just after a tag name to its `>`, skipping quotes and balanced braces. */
function scanTagEnd(text: string, from: number): TagEnd | null {
  let attrs = "";
  let i = from;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const close = text.indexOf(ch, i + 1);
      if (close === -1) return null;
      attrs += text.slice(i, close + 1);
      i = close + 1;
      continue;
    }
    if (ch === "{") {
      let depth = 0;
      let j = i;
      for (; j < text.length; j++) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      if (depth !== 0) return null;
      attrs += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === ">") return { end: i, selfClosing: attrs.endsWith("/") };
    attrs += ch;
    i++;
  }
  return null;
}

/** First block-level JSX component in `text`, with balanced braces/quotes and nested same-tag children. */
export function findJsxBlock(text: string): JsxBlock | null {
  OPEN_TAG.lastIndex = 0;
  const open = OPEN_TAG.exec(text);
  if (!open) return null;
  const tag = open[2];
  const afterName = open.index + open[0].length;
  const tagEnd = scanTagEnd(text, afterName);
  if (!tagEnd) return null;
  const attrs = text
    .slice(afterName, tagEnd.end)
    .replace(/\/$/, "")
    .trim();

  if (tagEnd.selfClosing) {
    return { tag, attrs, children: null, selfClosing: true, start: open.index, end: tagEnd.end + 1 };
  }

  const closeTag = `</${tag}>`;
  const reopen = new RegExp(`<${tag}(?=[\\s/>])`, "g");
  let depth = 1;
  let searchFrom = tagEnd.end + 1;
  for (;;) {
    const nextClose = text.indexOf(closeTag, searchFrom);
    if (nextClose === -1) return null;
    reopen.lastIndex = searchFrom;
    for (;;) {
      const nested = reopen.exec(text);
      if (!nested || nested.index >= nextClose) break;
      const nestedEnd = scanTagEnd(text, nested.index + nested[0].length);
      if (!nestedEnd) return null;
      searchFrom = nestedEnd.end + 1;
      // Self-closing reopens (`<Callout />`) need no close tag: not new depth.
      if (!nestedEnd.selfClosing) depth++;
    }
    depth--;
    if (depth === 0) {
      return {
        tag,
        attrs,
        children: text.slice(tagEnd.end + 1, nextClose),
        selfClosing: false,
        start: open.index,
        end: nextClose + closeTag.length,
      };
    }
    searchFrom = nextClose + closeTag.length;
  }
}

export type JsxProps = Record<string, unknown>;

/** Parse literal JSX props; returns null when anything is not a literal. */
export function parseJsxProps(attrs: string): JsxProps | null {
  const props: JsxProps = {};
  let i = 0;
  const skipWs = () => {
    while (i < attrs.length && /\s/.test(attrs[i])) i++;
  };
  skipWs();
  while (i < attrs.length) {
    const keyMatch = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(attrs.slice(i));
    if (!keyMatch) return null;
    const key = keyMatch[0];
    i += key.length;
    skipWs();
    if (attrs[i] !== "=") return null; // boolean shorthand not in the contract
    i++;
    skipWs();
    const value = readPropValue();
    if (value === undefined) return null;
    props[key] = value;
    skipWs();
  }
  return props;

  function readPropValue(): unknown {
    const ch = attrs[i];
    if (ch === '"' || ch === "'") {
      const close = attrs.indexOf(ch, i + 1);
      if (close === -1) return undefined;
      const raw = attrs.slice(i + 1, close);
      i = close + 1;
      return raw;
    }
    if (ch === "{") {
      let depth = 0;
      let j = i;
      for (; j < attrs.length; j++) {
        const c = attrs[j];
        if (c === '"' || c === "'") {
          const close = attrs.indexOf(c, j + 1);
          if (close === -1) return undefined;
          j = close;
          continue;
        }
        if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      if (depth !== 0) return undefined;
      const raw = attrs.slice(i + 1, j);
      i = j + 1;
      try {
        const trimmed = raw.trimStart();
        const needsRelax = trimmed.startsWith("{") || trimmed.startsWith("[");
        return JSON.parse(needsRelax ? relaxJson(raw) : raw);
      } catch {
        return undefined;
      }
    }
    const bare = /^[^\s]+/.exec(attrs.slice(i));
    if (!bare) return undefined;
    const token = bare[0];
    if (token === "true") { i += 4; return true; }
    if (token === "false") { i += 5; return false; }
    if (/^-?\d+(\.\d+)?$/.test(token)) { i += token.length; return Number(token); }
    return undefined; // identifiers/spreads: viewer executes no code
  }
}

/** Unquoted keys, single quotes and trailing commas → strict JSON. */
function relaxJson(raw: string): string {
  let out = "";
  let i = 0;
  let expectKey = true;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '"' || ch === "'") {
      const close = raw.indexOf(ch, i + 1);
      if (close === -1) throw new Error("unterminated string");
      out += `"${raw.slice(i + 1, close).replaceAll('"', '\\"')}"`;
      i = close + 1;
      expectKey = !expectKey;
      continue;
    }
    if (ch === "{" || ch === "[") {
      out += ch;
      i++;
      expectKey = ch === "{";
      continue;
    }
    if (ch === "," ) {
      const rest = raw.slice(i + 1).trimStart();
      if (rest.startsWith("}") || rest.startsWith("]")) { i++; continue; } // trailing comma
      out += ",";
      i++;
      expectKey = true;
      continue;
    }
    if (ch === ":" || ch === "}" || ch === "]") {
      out += ch;
      i++;
      if (ch === ":") expectKey = false;
      continue;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (expectKey) {
      const key = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(raw.slice(i));
      if (!key) throw new Error("bad key");
      out += `"${key[0]}"`;
      i += key[0].length;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

const h = React.createElement as (el: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => React.ReactElement;
const PALETTE = ["#58a6ff", "#3fb950", "#d29922", "#f85149", "#bc8cff", "#39c5cf"];
const CHART_WIDTH = 720;

function renderChart(p: JsxProps): string | null {
  const data = p.data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const type = p.type === "line" || p.type === "area" || p.type === "pie" ? p.type : "bar";
  const x = typeof p.x === "string" && p.x ? p.x : "name";
  const first = data[0] as Record<string, unknown>;
  const numeric = Object.keys(first).filter((k) => k !== x && typeof first[k] === "number");
  const series = Array.isArray(p.series) && p.series.length
    ? p.series.map(String)
    : numeric.slice(0, 4);
  if (series.length === 0) return null;
  const height = typeof p.height === "number" ? Math.min(480, Math.max(160, p.height)) : 240;

  const grid = h(CartesianGrid, { key: "grid", stroke: "var(--border)", strokeDasharray: "3 3" });
  const xAxis = h(XAxis, { key: "x", dataKey: x, stroke: "var(--muted)", tick: { fill: "var(--muted)", fontSize: 12 } });
  const yAxis = h(YAxis, { key: "y", stroke: "var(--muted)", tick: { fill: "var(--muted)", fontSize: 12 }, width: 44 });
  const legend = series.length > 1 ? h(Legend, { key: "legend" }) : null;

  let chart: React.ReactNode;
  if (type === "pie") {
    chart = h(PieChart, { width: CHART_WIDTH, height, key: "c" },
      h(Pie, { data, dataKey: series[0], nameKey: x, outerRadius: Math.min(height / 2 - 12, 96), key: "pie" },
        data.map((_, idx) => h(Cell, { key: idx, fill: PALETTE[idx % PALETTE.length] }))),
      legend,
    );
  } else if (type === "line") {
    chart = h(LineChart, { width: CHART_WIDTH, height, data, key: "c" },
      grid, xAxis, yAxis, h(Tooltip, { key: "tip" }), legend,
      series.map((key, idx) => h(Line, { key, type: "monotone", dataKey: key, stroke: PALETTE[idx % PALETTE.length], strokeWidth: 2, dot: { r: 3 } })),
    );
  } else if (type === "area") {
    chart = h(AreaChart, { width: CHART_WIDTH, height, data, key: "c" },
      grid, xAxis, yAxis, h(Tooltip, { key: "tip" }), legend,
      series.map((key, idx) => h(Area, {
        key, type: "monotone", dataKey: key,
        stroke: PALETTE[idx % PALETTE.length], fill: PALETTE[idx % PALETTE.length], fillOpacity: 0.18,
      })),
    );
  } else {
    chart = h(BarChart, { width: CHART_WIDTH, height, data, key: "c" },
      grid, xAxis, yAxis, h(Tooltip, { key: "tip" }), legend,
      series.map((key, idx) => h(Bar, { key, dataKey: key, fill: PALETTE[idx % PALETTE.length], radius: [3, 3, 0, 0] })),
    );
  }

  const title = typeof p.title === "string" && p.title ? `<p class="mv-chart-title">${escape(p.title)}</p>` : "";
  return `<figure class="mv-graph mv-chart">${EXPAND_BUTTON}${title}${renderToStaticMarkup(chart)}</figure>`;
}

const CALLOUT_KINDS: Record<string, true> = { info: true, warning: true, success: true, danger: true };

function renderCallout(p: JsxProps, childrenHtml: string): string | null {
  const kind = typeof p.type === "string" && CALLOUT_KINDS[p.type] ? p.type : "info";
  const title = typeof p.title === "string" && p.title ? `<p class="mv-callout-title">${escape(p.title)}</p>` : "";
  return `<div class="mv-callout mv-callout--${kind}">${title}<div class="mv-callout-body">${childrenHtml}</div></div>`;
}

function renderStat(p: JsxProps): string | null {
  if (typeof p.value === "undefined") return null;
  const label = typeof p.label === "string" ? `<span class="mv-stat-label">${escape(p.label)}</span>` : "";
  let delta = "";
  if (typeof p.delta === "string" && p.delta) {
    const dir = p.delta.trimStart().startsWith("-") ? "down" : "up";
    delta = `<span class="mv-stat-delta mv-stat-delta--${dir}">${escape(p.delta)}</span>`;
  }
  return `<div class="mv-stat"><span class="mv-stat-value">${escape(String(p.value))}</span>${label}${delta}</div>`;
}

function escape(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
/**
 * Browser-like embed for a sibling file of the same artifact (wireframes,
 * mock pages, generated HTML). Only artifact-relative paths: the iframe must
 * never point off-origin.
 */
function renderWebframe(p: JsxProps): string | null {
  const src = typeof p.src === "string" ? p.src.trim() : "";
  const unsafe =
    !src ||
    src.includes("://") ||
    src.startsWith("//") ||
    src.startsWith("/") ||
    src.split("/").some((s) => s === "..") ||
    src.includes("\\") ||
    src.includes("\0");
  if (unsafe) return null;
  const height = typeof p.height === "number" ? Math.min(720, Math.max(160, p.height)) : 360;
  const title = typeof p.title === "string" && p.title ? escape(p.title) : src;
  return `<div class="mv-frame"><div class="mv-frame-bar"><span class="mv-frame-dot"></span><span class="mv-frame-dot"></span><span class="mv-frame-dot"></span><span class="mv-frame-url">${escape(src)}</span></div><iframe class="mv-frame-body" src="${escape(src)}" title="${title}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups" style="height:${height}px"></iframe></div>`;
}

/**
 * Render a built-in component. `childrenHtml` arrives already rendered from
 * markdown. Returns null when the component is unknown or props violate the
 * literal contract (caller falls back to the placeholder).
 */
export function renderMdxComponent(tag: string, props: JsxProps, childrenHtml: string): string | null {
  switch (tag) {
    case "Chart":
      return renderChart(props);
    case "Callout":
      return renderCallout(props, childrenHtml);
    case "Stat":
      return renderStat(props);
    case "Stats":
      return `<div class="mv-stats">${childrenHtml}</div>`;
    case "Webframe":
      return renderWebframe(props);
    case "Section":
      return renderSection(props, childrenHtml);
    case "Svg":
      return renderSvg(props);
    default:
      return null;
  }
}

/**
 * Named section: a titled card whose heading doubles as the document
 * index entry (the viewer builds its "Secciones" sidebar from h1-h3, so
 * no extra wiring is needed — add `##` headings or <Section> and the
 * sidebar follows what authors keep adding).
 */
function renderSection(p: JsxProps, childrenHtml: string): string | null {
  const title = typeof p.title === "string" ? p.title.trim() : "";
  if (!title) return null;
  const rawId = typeof p.id === "string" && p.id.trim() ? p.id.trim() : slugifyHeading(title);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(rawId)) return null;
  const subtitle =
    typeof p.subtitle === "string" && p.subtitle.trim()
      ? `<p class="mv-section-sub">${escape(p.subtitle.trim())}</p>`
      : "";
  return `<section class="mv-section"><h2 id="${rawId}">${escape(title)}</h2>${subtitle}<div class="mv-section-body">${childrenHtml}</div></section>`;
}

export function slugifyHeading(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "seccion";
}

const SVG_COLORS: Record<string, string> = {
  blue: "#58a6ff",
  green: "#3fb950",
  yellow: "#d29922",
  red: "#f85149",
  purple: "#bc8cff",
  teal: "#39c5cf",
  gray: "#9198a1",
};

let svgCounter = 0;

/**
 * Declarative vector graphics: authors describe boxes, circles, arrows,
 * lines and texts as literal data — no hand-written `<svg>` markup, no
 * code execution. Renders to an inline static SVG (theme-safe palette,
 * text follows the viewer theme via CSS).
 */
/**
 * Every graphic (Chart, Svg, mermaid) carries an expand control: the
 * viewer script turns its figure into a full-viewport overlay (ESC or
 * backdrop click closes). Mermaid uses the same constant in
 * markdown-viewer.ts — keep the class in sync.
 */
export const EXPAND_BUTTON =
  `<button class="mv-expand" type="button" aria-label="Ampliar gráfico" title="Ampliar"><span aria-hidden="true">⤢</span></button>`;

function renderSvg(p: JsxProps): string | null {
  const shapes = p.shapes;
  if (!Array.isArray(shapes) || shapes.length === 0 || shapes.length > 40) return null;
  const width = num(p.width, 640, 240, 860);
  const height = num(p.height, 220, 120, 520);
  const title = typeof p.title === "string" && p.title.trim() ? `<p class="mv-chart-title">${escape(p.title.trim())}</p>` : "";
  const marker = `mv-arrow-${++svgCounter}`;
  const parts: string[] = [];
  for (const s of shapes) {
    const frag = renderShape(s);
    if (frag) parts.push(frag);
  }
  if (parts.length === 0) return null;
  const defs = `<defs><marker id="${marker}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill="${SVG_COLORS.gray}"></path></marker></defs>`;
  return `<figure class="mv-graph mv-svg">${EXPAND_BUTTON}${title}<svg viewBox="0 0 ${width} ${height}" role="img" xmlns="http://www.w3.org/2000/svg">${defs}${parts.join("")}</svg></figure>`;

  function renderShape(s: unknown): string | null {
    if (typeof s !== "object" || s === null) return null;
    const shape = s as Record<string, unknown>;
    const type = shape.type;
    const color = typeof shape.color === "string" && SVG_COLORS[shape.color] ? SVG_COLORS[shape.color] : SVG_COLORS.blue;
    if (type === "box") {
      const x = finite(shape.x); const y = finite(shape.y);
      const w = finite(shape.w); const hgt = finite(shape.h);
      if (x === null || y === null || w === null || hgt === null || w < 20 || hgt < 20) return null;
      const label = text(shape.label);
      const sub = text(shape.sub);
      const cy = y + hgt / 2 + (sub ? -8 : 0);
      return `<g><rect x="${x}" y="${y}" width="${w}" height="${hgt}" rx="10" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-width="1.5"></rect>` +
        (label ? `<text x="${x + w / 2}" y="${cy}" text-anchor="middle" dominant-baseline="central" class="mv-svg-label">${label}</text>` : "") +
        (sub ? `<text x="${x + w / 2}" y="${cy + 18}" text-anchor="middle" dominant-baseline="central" class="mv-svg-sub">${sub}</text>` : "") +
        `</g>`;
    }
    if (type === "circle") {
      const cx = finite(shape.cx); const cy = finite(shape.cy); const r = finite(shape.r);
      if (cx === null || cy === null || r === null || r < 8) return null;
      const label = text(shape.label);
      return `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-width="1.5"></circle>` +
        (label ? `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" class="mv-svg-label">${label}</text>` : "") +
        `</g>`;
    }
    if (type === "arrow" || type === "line") {
      const x1 = finite(shape.x1); const y1 = finite(shape.y1);
      const x2 = finite(shape.x2); const y2 = finite(shape.y2);
      if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
      const dashed = shape.dashed === true ? ` stroke-dasharray="6 4"` : "";
      const head = type === "arrow" ? ` marker-end="url(#${marker})"` : "";
      const label = text(shape.label);
      const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2 - 8;
      return `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SVG_COLORS.gray}" stroke-width="1.8"${dashed}${head}></line>` +
        (label ? `<text x="${mx}" y="${my}" text-anchor="middle" class="mv-svg-tag">${label}</text>` : "") +
        `</g>`;
    }
    if (type === "text") {
      const x = finite(shape.x); const y = finite(shape.y);
      const content = text(shape.text);
      if (x === null || y === null || !content) return null;
      const size = num(shape.size, 13, 9, 28);
      const anchor = shape.anchor === "start" || shape.anchor === "end" ? shape.anchor : "middle";
      return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="mv-svg-label" style="font-size:${size}px">${content}</text>`;
    }
    return null;
  }

  function finite(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
  }
  function num(v: unknown, fallback: number, min: number, max: number): number {
    return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  }
  function text(v: unknown): string {
    return typeof v === "string" && v.trim() ? escape(v.trim().slice(0, 80)) : "";
  }
}
