import type { JsxProps } from './mdx-components.js';
import { isSafeHref } from './data-contracts.js';
import { renderDataError, validateDataTitle } from './data-components.js';
import { z } from 'zod';

function escape(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Sibling assets keep the document's local/broker scope; external media is HTTPS only. */
function isSafeAssetSource(src: string): boolean {
  if (!src || src.startsWith('#')) return false;
  if (isSafeHref(src)) return true;
  if (/[\\\u0000-\u0020\u007f-\u009f]/.test(src)) return false;
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function renderCard(p: JsxProps, childrenHtml: string): string {
  const title = validateDataTitle(p.title);
  if (!title.ok) return renderDataError('Card', [title.error]);
  if (p.subtitle !== undefined && typeof p.subtitle !== 'string') return renderDataError('Card', ['subtitle must be a string']);
  if (p.alt !== undefined && typeof p.alt !== 'string') return renderDataError('Card', ['alt must be a string']);
  if (p.asset === undefined && p.assetType !== undefined) return renderDataError('Card', ['assetType requires an asset']);
  let media = '';
  if (p.asset !== undefined) {
    if (typeof p.asset !== 'string' || !isSafeAssetSource(p.asset.trim())) {
      return renderDataError('Card', ['asset must be a safe document-relative path or an HTTPS URL']);
    }
    const src = p.asset.trim();
    const pathname = src.split(/[?#]/)[0].toLowerCase();
    const inferred = /\.(png|jpe?g|gif|webp|avif|svg)$/.test(pathname) ? 'image'
      : /\.(mp4|webm|ogv|mov)$/.test(pathname) ? 'video'
      : /\.(mp3|wav|ogg|m4a|flac)$/.test(pathname) ? 'audio' : 'file';
    const kind = p.assetType === undefined ? inferred : p.assetType;
    if (typeof kind !== 'string' || !['image', 'video', 'audio', 'file'].includes(kind)) return renderDataError('Card', ['assetType must be image, video, audio or file']);
    const escapedSrc = escape(src);
    const alt = escape(typeof p.alt === 'string' ? p.alt : title.title ?? src);
    if (kind === 'image') media = `<img src="${escapedSrc}" alt="${alt}" loading="lazy" decoding="async">`;
    else if (kind === 'video') media = `<video src="${escapedSrc}" controls preload="metadata" playsinline aria-label="${alt}"></video>`;
    else if (kind === 'audio') media = `<audio src="${escapedSrc}" controls preload="metadata" aria-label="${alt}"></audio>`;
    else media = `<a class="mv-card-file" href="${escapedSrc}" target="_blank" rel="noopener noreferrer">Open asset: ${escape(src)}</a>`;
    media = `<div class="mv-card-media mv-card-media--${kind}">${media}</div>`;
  }
  if (!title.title && !media && !childrenHtml.trim() && !p.subtitle) return renderDataError('Card', ['Provide a title, asset or content']);
  const heading = title.title ? `<h3 class="mv-card-title">${escape(title.title)}</h3>` : '';
  const subtitle = typeof p.subtitle === 'string' && p.subtitle ? `<p class="mv-card-subtitle">${escape(p.subtitle)}</p>` : '';
  return `<article class="mv-card">${media}<div class="mv-card-content">${heading}${subtitle}<div class="mv-card-body">${childrenHtml}</div></div></article>`;
}

export function renderCards(p: JsxProps, childrenHtml: string): string {
  if (p.columns !== undefined && (typeof p.columns !== 'number' || !Number.isInteger(p.columns) || p.columns < 1 || p.columns > 4)) {
    return renderDataError('Cards', ['columns must be an integer from 1 to 4']);
  }
  if (!childrenHtml.trim()) return renderDataError('Cards', ['Provide card children']);
  const style = p.columns === undefined ? '' : ` style="--card-columns:${p.columns}"`;
  const className = p.columns === undefined ? 'mv-cards' : 'mv-cards mv-cards--columns';
  return `<div class="${className}"${style}>${childrenHtml}</div>`;
}

export function renderCarousel(p: JsxProps, childrenHtml: string): string {
  const title = validateDataTitle(p.title);
  if (!title.ok) return renderDataError('Carousel', [title.error]);
  const perView = p.perView === undefined ? 1 : p.perView;
  if (typeof perView !== 'number' || !Number.isInteger(perView) || perView < 1 || perView > 3) return renderDataError('Carousel', ['perView must be an integer from 1 to 3']);
  if (!childrenHtml.trim()) return renderDataError('Carousel', ['Provide slide children']);
  const label = escape(title.title ?? 'Carousel');
  const heading = title.title ? `<p class="mv-carousel-title">${label}</p>` : '';
  return `<section class="mv-carousel" role="region" aria-roledescription="carousel" aria-label="${label}" style="--carousel-per-view:${perView}"><div class="mv-carousel-head">${heading}<div class="mv-carousel-controls" hidden><button type="button" data-carousel-prev aria-label="Previous slide">‹</button><span data-carousel-status aria-live="polite" aria-atomic="true"></span><button type="button" data-carousel-next aria-label="Next slide">›</button></div></div><div class="mv-carousel-track" tabindex="0" aria-label="Slides in ${label}">${childrenHtml}</div></section>`;
}

const tableLabel = z.string().min(1).max(256).refine((value) => value.trim().length > 0, 'Must not be blank');
const tableColumn = z.union([
  tableLabel.transform((label) => ({ key: label, label, align: 'left' as const })),
  z.object({ key: tableLabel, label: tableLabel, align: z.enum(['left', 'center', 'right']).default('left') }),
]);
const tableCell = z.union([z.string().max(4096), z.number(), z.boolean(), z.null()]);
const tableData = z.object({
  columns: z.array(tableColumn).min(1).max(24),
  rows: z.array(z.union([z.array(tableCell).max(24), z.record(z.string(), tableCell)])).max(500),
});

/** Cells are escaped scalar values; rendering never evaluates author-supplied JSX or HTML. */
export function renderTable(p: JsxProps, childrenHtml: string): string {
  const title = validateDataTitle(p.title);
  if (!title.ok) return renderDataError('Table', [title.error]);
  const label = escape(title.title ?? 'Table');
  if (p.columns === undefined && p.rows === undefined) {
    if (!childrenHtml.includes('<table>')) return renderDataError('Table', ['Provide columns and rows, or a Markdown table as children']);
    const caption = title.title ? `<caption>${label}</caption>` : '';
    return `<div class="mv-table-scroll" role="region" aria-label="${label}" tabindex="0">${childrenHtml.replace('<table>', `<table class="mv-table">${caption}`)}</div>`;
  }
  if (childrenHtml.trim()) return renderDataError('Table', ['Use rows/columns or Markdown children, not both']);
  const parsed = tableData.safeParse({ columns: p.columns, rows: p.rows });
  if (!parsed.success) {
    return renderDataError('Table', parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`));
  }
  const { columns, rows } = parsed.data;
  if (new Set(columns.map((column) => column.key)).size !== columns.length) return renderDataError('Table', ['Column keys must be unique']);
  let cellCharacters = 0;
  const renderedRows: string[] = [];
  for (const row of rows) {
    if (Array.isArray(row) && row.length !== columns.length) return renderDataError('Table', ['Each array row must match the columns']);
    const cells: string[] = [];
    for (let index = 0; index < columns.length; index++) {
      const column = columns[index];
      const value = Array.isArray(row) ? row[index] : Object.hasOwn(row, column.key) ? row[column.key] : null;
      const text = value === null || value === undefined ? '—' : String(value);
      cellCharacters += text.length;
      if (text.length > 4096 || cellCharacters > 512000) return renderDataError('Table', ['Cell text exceeds the 4,096 character per-cell or 512,000 character total limit']);
      cells.push(`<td class="mv-table-${column.align}">${escape(text)}</td>`);
    }
    renderedRows.push(`<tr>${cells.join('')}</tr>`);
  }
  const caption = title.title ? `<caption>${label}</caption>` : '';
  const headers = columns.map((column) => `<th scope="col" class="mv-table-${column.align}">${escape(column.label)}</th>`).join('');
  const body = renderedRows.length ? renderedRows.join('') : `<tr><td colspan="${columns.length}" class="mv-table-empty">No rows</td></tr>`;
  return `<div class="mv-table-scroll" role="region" aria-label="${label}" tabindex="0"><table class="mv-table">${caption}<thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const pageItems = z.array(z.object({
  title: tableLabel,
  href: z.string().min(1).max(2048).refine((href) => !href.startsWith('#') && isSafeHref(href) && /\.(mdx?|html)(?:#.*)?$/.test(href), 'Use a safe relative .mdx, .md or .html page path'),
  description: z.string().max(4096).optional(),
})).min(1).max(50);

/** Page sources are ordinary sibling files, so links stay in the local/broker artifact scope. */
export function renderPages(p: JsxProps): string {
  const title = validateDataTitle(p.title);
  if (!title.ok) return renderDataError('Pages', [title.error]);
  const parsed = pageItems.safeParse(p.items);
  if (!parsed.success) return renderDataError('Pages', parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`));
  const items = parsed.data;
  if (new Set(items.map((item) => item.href)).size !== items.length) return renderDataError('Pages', ['Page hrefs must be unique']);
  const heading = title.title ? `<p class="mv-pages-title">${escape(title.title)}</p>` : '';
  const links = items.map((item, index) => `<li><a href="${escape(item.href)}"><span class="mv-pages-number" aria-hidden="true">${index + 1}</span><span><span class="mv-pages-label">${escape(item.title)}</span>${item.description ? `<span class="mv-pages-description">${escape(item.description)}</span>` : ''}</span></a></li>`).join('');
  return `<nav class="mv-pages" aria-label="${escape(title.title ?? 'Pages')}">${heading}<ol class="mv-pages-items">${links}</ol><div class="mv-pages-steps" hidden></div></nav>`;
}
