import { DOMParser, DOMImplementation, XMLSerializer, Node as XmlNode, onWarningStopParsing, type Element as XmlElement } from '@xmldom/xmldom';
import { isSafeHref } from './data-contracts.js';
import { renderDataError } from './data-components.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
export const INLINE_SVG_LIMITS = { bytes: 512 * 1024, elements: 2048, depth: 40, canvas: 4096 } as const;
const TAGS: Record<string, string> = {
  svg: 'svg', g: 'g', defs: 'defs', title: 'title', desc: 'desc',
  rect: 'rect', circle: 'circle', ellipse: 'ellipse', line: 'line', path: 'path',
  polyline: 'polyline', polygon: 'polygon', text: 'text', tspan: 'tspan', textpath: 'textPath',
  marker: 'marker', lineargradient: 'linearGradient', radialgradient: 'radialGradient', stop: 'stop',
  clippath: 'clipPath', mask: 'mask', pattern: 'pattern', symbol: 'symbol', use: 'use', image: 'image', a: 'a',
};
const ATTRIBUTES = [
  'id', 'class', 'role', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden',
  'viewBox', 'preserveAspectRatio', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2',
  'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform', 'dx', 'dy', 'rotate',
  'textLength', 'lengthAdjust', 'startOffset', 'method', 'spacing',
  'fill', 'stroke', 'color', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-width',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'fill-rule', 'clip-rule', 'clip-path', 'mask', 'vector-effect',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline',
  'alignment-baseline', 'letter-spacing', 'word-spacing', 'visibility', 'display',
  'marker-start', 'marker-mid', 'marker-end', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient', 'markerUnits',
  'gradientUnits', 'gradientTransform', 'spreadMethod', 'offset', 'stop-color', 'stop-opacity',
  'patternUnits', 'patternContentUnits', 'patternTransform', 'maskUnits', 'maskContentUnits', 'clipPathUnits',
].reduce<Record<string, string>>((names, name) => { names[name.toLowerCase()] = name; return names; }, {});
// String-valued JSX aliases are harmless; expressions and style objects are never evaluated.
Object.assign(ATTRIBUTES, {
  classname: 'class', strokewidth: 'stroke-width', strokedasharray: 'stroke-dasharray',
  strokelinecap: 'stroke-linecap', strokelinejoin: 'stroke-linejoin', strokeopacity: 'stroke-opacity',
  fillopacity: 'fill-opacity', fillrule: 'fill-rule', clippath: 'clip-path',
  fontfamily: 'font-family', fontsize: 'font-size', fontweight: 'font-weight',
  textanchor: 'text-anchor', dominantbaseline: 'dominant-baseline',
  markerstart: 'marker-start', markermid: 'marker-mid', markerend: 'marker-end',
});
const STYLE_PROPERTIES: Record<string, true> = {
  fill: true, stroke: true, color: true, opacity: true, 'fill-opacity': true, 'stroke-opacity': true,
  'stroke-width': true, 'stroke-dasharray': true, 'stroke-dashoffset': true, 'stroke-linecap': true,
  'stroke-linejoin': true, 'stroke-miterlimit': true, 'fill-rule': true, 'clip-rule': true,
  'clip-path': true, mask: true, 'vector-effect': true, font: true, 'font-family': true,
  'font-size': true, 'font-weight': true, 'font-style': true, 'text-anchor': true,
  'dominant-baseline': true, 'letter-spacing': true, 'word-spacing': true,
  visibility: true, display: true, transform: true,
};
const USE_TARGETS: Record<string, true> = { rect: true, circle: true, ellipse: true, line: true, path: true, polyline: true, polygon: true };
let svgCounter = 0;

function isElement(node: XmlNode): node is XmlElement {
  return node.nodeType === XmlNode.ELEMENT_NODE;
}

/** Scan XML tag boundaries, not SVG contents: quoted >, comments and CDATA cannot close the block. */
export function findInlineSvgEnd(source: string, start: number): number | null {
  let depth = 0;
  let cursor = start;
  while (cursor < source.length) {
    const open = source.indexOf('<', cursor);
    if (open === -1) return null;
    const special = source.startsWith('<!--', open) ? '-->' : source.startsWith('<![CDATA[', open) ? ']]>' : source.startsWith('<?', open) ? '?>' : null;
    if (special) {
      const end = source.indexOf(special, open + 2);
      if (end === -1) return null;
      cursor = end + special.length;
      continue;
    }
    let quote = '';
    let end = open + 1;
    for (; end < source.length; end++) {
      const ch = source[end];
      if (quote) { if (ch === quote) quote = ''; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') break;
    }
    if (end === source.length) return null;
    const tag = source.slice(open + 1, end).trim();
    if (/^svg(?=[\s/]|$)/.test(tag)) {
      if (!tag.endsWith('/')) depth++;
    } else if (/^\/svg\s*$/.test(tag)) depth--;
    cursor = end + 1;
    if (depth === 0) return cursor;
  }
  return null;
}

/** Only block-level lowercase <svg> is captured; <Svg shapes={...}> remains a built-in component. */
export function replaceInlineSvgBlocks(source: string, expandButton: string): string {
  const opening = /^[ \t]*<svg(?=[\s/>])/gm;
  let cursor = 0;
  let output = '';
  for (;;) {
    opening.lastIndex = cursor;
    const match = opening.exec(source);
    if (!match) return output + source.slice(cursor);
    const start = source.indexOf('<', match.index);
    const end = findInlineSvgEnd(source, start);
    output += source.slice(cursor, match.index);
    if (end === null) return output + renderDataError('Inline SVG', ['Missing closing </svg>; the incomplete block was not rendered']);
    output += renderInlineSvg(source.slice(start, end), expandButton);
    cursor = end;
  }
}

/** CSS references are local fragment IDs only; no scripts, remote URLs, escapes or stylesheet rules. */
function safePresentationValue(value: string, ids: Map<string, string>): string | null {
  const clean = value.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (/[\\@{}\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(clean) || /expression\s*\(|(?:javascript|data|https?)\s*:/i.test(clean)) return null;
  let invalid = false;
  const result = clean.replace(/url\s*\(\s*(['"]?)([^)]*?)\1\s*\)/gi, (_match, _quote: string, target: string) => {
    const key = target.trim();
    const id = key.startsWith('#') ? ids.get(key.slice(1)) : undefined;
    if (!id) { invalid = true; return ''; }
    return `url(#${id})`;
  });
  if (invalid || /url\s*\(/i.test(result.replace(/url\(#[A-Za-z0-9_.:-]+\)/g, ''))) return null;
  return result;
}

/** XML parsing + a new allowlisted DOM avoids regex-based sanitization or executable authored JSX. */
export function renderInlineSvg(source: string, expandButton: string): string {
  try {
    if (new TextEncoder().encode(source).length > INLINE_SVG_LIMITS.bytes) throw new Error('SVG exceeds 512 KiB');
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)) throw new Error('DOCTYPE and entity declarations are not supported');
    const parsed = new DOMParser({ onError: onWarningStopParsing, xmlns: { '': SVG_NS, xlink: XLINK_NS } }).parseFromString(source, 'image/svg+xml');
    const root = parsed.documentElement;
    if (!root || root.localName !== 'svg' || root.namespaceURI !== SVG_NS) throw new Error('Expected an SVG root element');
    const prefix = `mv-inline-${++svgCounter}-`;
    const ids = new Map<string, string>();
    const idElements = new Map<string, XmlElement>();
    let elements = 0;
    const pending: { node: XmlNode; depth: number }[] = [{ node: root, depth: 0 }];
    while (pending.length) {
      const entry = pending.pop()!;
      if (!isElement(entry.node)) continue;
      if (++elements > INLINE_SVG_LIMITS.elements || entry.depth > INLINE_SVG_LIMITS.depth) throw new Error('SVG exceeds 2,048 elements or 40 nesting levels');
      const tag = entry.node.localName?.toLowerCase() ?? '';
      if (entry.node.namespaceURI !== SVG_NS || !Object.hasOwn(TAGS, tag)) continue;
      for (const attribute of entry.node.attributes) {
        if (attribute.name.toLowerCase() !== 'id') continue;
        if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(attribute.value) || ids.has(attribute.value)) throw new Error('SVG IDs must be unique simple names of at most 128 characters');
        ids.set(attribute.value, `${prefix}${attribute.value}`);
        idElements.set(attribute.value, entry.node);
      }
      for (const child of entry.node.childNodes) pending.push({ node: child, depth: entry.depth + 1 });
    }
    const document = new DOMImplementation().createDocument(SVG_NS, 'svg', null);
    const cleaned = document.documentElement!;

    function copyElement(from: XmlElement, to: XmlElement): void {
      const tag = from.localName?.toLowerCase() ?? '';
      const seen = new Set<string>();
      for (const attribute of from.attributes) {
        if (attribute.value.length > 16384) throw new Error('SVG attribute exceeds 16,384 characters');
        const rawName = attribute.name.toLowerCase();
        if (rawName === 'xmlns' || rawName.startsWith('xmlns:') || rawName.startsWith('on')) continue;
        const name = rawName === 'style' || rawName === 'href' || rawName === 'xlink:href' ? rawName : Object.hasOwn(ATTRIBUTES, rawName) ? ATTRIBUTES[rawName] : null;
        if (!name) continue;
        if (seen.has(name)) throw new Error(`Duplicate SVG attribute: ${name}`);
        seen.add(name);
        const value = attribute.value;
        if (name === 'id') to.setAttribute('id', ids.get(value)!);
        else if (name === 'aria-labelledby' || name === 'aria-describedby') {
          const references = value.trim().split(/\s+/).map((id) => ids.get(id)).filter((id): id is string => !!id);
          if (references.length) to.setAttribute(name, references.join(' '));
        } else if (name === 'href' || name === 'xlink:href') {
          if (attribute.namespaceURI && attribute.namespaceURI !== XLINK_NS) continue;
          const href = value.trim();
          if (tag === 'use' || tag === 'textpath') {
            const key = href.startsWith('#') ? href.slice(1) : '';
            const id = ids.get(key);
            const target = idElements.get(key);
            if (id && target) {
              const targetTag = target.localName?.toLowerCase() ?? '';
              if (tag === 'use' && (!Object.hasOwn(USE_TARGETS, targetTag) || target.children.length)) throw new Error('use may reference only local primitive shapes without child elements; inline grouped geometry instead');
              if (tag === 'textpath' && targetTag !== 'path') throw new Error('textPath must reference a local path');
              to.setAttribute('href', `#${id}`);
            }
          } else if ((tag === 'image' || tag === 'a') && isSafeHref(href) && (tag !== 'image' || !href.startsWith('#'))) {
            to.setAttribute('href', href.startsWith('#') && ids.has(href.slice(1)) ? `#${ids.get(href.slice(1))}` : href);
          }
        } else if (name === 'style') {
          const declarations: string[] = [];
          for (const declaration of value.split(';')) {
            const colon = declaration.indexOf(':');
            const property = declaration.slice(0, colon).trim().toLowerCase();
            if (colon < 0 || !Object.hasOwn(STYLE_PROPERTIES, property)) continue;
            const safe = safePresentationValue(declaration.slice(colon + 1), ids);
            if (safe !== null) declarations.push(`${property}:${safe}`);
          }
          if (declarations.length) to.setAttribute('style', declarations.join(';'));
        } else if (name.startsWith('aria-') || name === 'class' || name === 'role') to.setAttribute(name, value);
        else {
          const safe = safePresentationValue(value, ids);
          if (safe !== null) to.setAttribute(name, safe);
        }
      }
      for (const child of from.childNodes) {
        if (isElement(child)) {
          const childTag = child.localName?.toLowerCase() ?? '';
          if (child.namespaceURI !== SVG_NS || !Object.hasOwn(TAGS, childTag)) continue;
          const element = document.createElementNS(SVG_NS, TAGS[childTag]);
          copyElement(child, element);
          to.appendChild(element);
        } else if (child.nodeType === XmlNode.TEXT_NODE || child.nodeType === XmlNode.CDATA_SECTION_NODE) {
          if (['text', 'tspan', 'textpath', 'title', 'desc'].includes(tag)) to.appendChild(document.createTextNode(child.nodeValue ?? ''));
        }
      }
    }
    copyElement(root, cleaned);
    let viewBox = cleaned.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
    if (!viewBox) {
      const width = cleaned.getAttribute('width')?.match(/^([0-9.]+)(?:px)?$/)?.[1];
      const height = cleaned.getAttribute('height')?.match(/^([0-9.]+)(?:px)?$/)?.[1];
      if (width && height) viewBox = [0, 0, Number(width), Number(height)];
    }
    if (!viewBox || viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value)) || viewBox[2] <= 0 || viewBox[3] <= 0 || viewBox[2] > INLINE_SVG_LIMITS.canvas || viewBox[3] > INLINE_SVG_LIMITS.canvas) throw new Error('Provide a valid viewBox (positive width/height up to 4,096), or numeric width and height');
    cleaned.setAttribute('viewBox', viewBox.join(' '));
    cleaned.setAttribute('role', 'img');
    if (!cleaned.hasAttribute('fill')) cleaned.setAttribute('fill', 'var(--fg)');
    if (!cleaned.hasAttribute('color')) cleaned.setAttribute('color', 'var(--fg)');
    if (!cleaned.hasAttribute('aria-label') && !cleaned.hasAttribute('aria-labelledby')) {
      const title = cleaned.getElementsByTagName('title')[0]?.textContent?.trim();
      cleaned.setAttribute('aria-label', title || 'SVG graphic');
    }
    // A single HTML line prevents Markdown blank lines, braces and code syntax from entering the SVG tree.
    const svg = new XMLSerializer().serializeToString(cleaned).replace(/[\r\n]+/g, ' ').replaceAll('{', '&#123;').replaceAll('}', '&#125;');
    return `<figure class="mv-graph mv-svg mv-svg-inline" style="--svg-native-width:${viewBox[2]}px">${expandButton}${svg}</figure>`;
  } catch (error) {
    return renderDataError('Inline SVG', [error instanceof Error ? error.message.slice(0, 240) : 'Invalid SVG markup']);
  }
}
