/**
 * Machine- and human-readable description of what the artifact viewer
 * supports. Single source of truth for `artifact capabilities [--json]`,
 * agent guidance and the skill docs — keep in sync with the renderers in
 * `src/server/markdown-viewer.ts` and `src/server/mdx-components.ts`.
 */

export interface ComponentPropDoc {
  name: string;
  required: boolean;
  description: string;
}

export interface ComponentDoc {
  name: string;
  description: string;
  props: ComponentPropDoc[];
  example: string;
}

export interface FormatDoc {
  format: 'html' | 'md' | 'mdx';
  entryFile: string;
  description: string;
}

export interface ViewerCapabilities {
  formats: FormatDoc[];
  components: ComponentDoc[];
  features: string[];
  /** Editorial guardrails so agents don't decorate documents with visuals. */
  usageGuidance: string[];
  mermaid: {
    supported: true;
    usage: string;
    note: string;
  };
  guidePath: '/mdx-guide';
  /** Where the JSON behind `artifact capabilities --json` comes from. */
  cliCommand: 'artifact capabilities [--json]';
}

export function getViewerCapabilities(): ViewerCapabilities {
  return {
    formats: [
      {
        format: 'mdx',
        entryFile: 'index.mdx',
        description: 'default for documents: Markdown + built-in components (Chart, Stats, Callout, Section, Svg, Webframe, Video, Audio, Card, Cards, Carousel, Table, Pages, TaskList, Kanban, Properties)',
      },
      {
        format: 'md',
        entryFile: 'index.md',
        description: 'plain prose only (no visuals); Markdown rendered by the built-in viewer (GFM + mermaid)',
      },
      {
        format: 'html',
        entryFile: 'index.html',
        description: 'standalone HTML page (interactive/legacy), isolated iframe',
      },
    ],
    components: [
      {
        name: 'Chart',
        description: 'Chart rendered server-side with recharts (static, themed)',
        props: [
          { name: 'type', required: false, description: 'bar (default) | line | area | pie' },
          { name: 'data', required: true, description: 'literal array of objects with a category/time key and finite numeric values; use verified data and label units' },
          { name: 'x', required: false, description: 'x-axis key (default "name"); input order is preserved, so sort time data before authoring' },
          { name: 'series', required: false, description: 'numeric keys to plot; first-row numeric keys are inferred, up to 4 by default. Prefer 1-4 compatible-unit series' },
          { name: 'title', required: false, description: 'caption identifying the metric, units and context; charts are static, not interactive tooltips' },
          { name: 'height', required: false, description: 'px, 160-480 (default 240)' },
        ],
        example: '<Chart type="bar" data={[{ name: "Q1", mrr: 12 }]} series={["mrr"]} />',
      },
      {
        name: 'Stats',
        description: 'Responsive grid wrapper for KPI cells',
        props: [{ name: 'children', required: true, description: 'one or more <Stat /> components' }],
        example: '<Stats><Stat value="14.9k" label="MRR" delta="+24%" /></Stats>',
      },
      {
        name: 'Stat',
        description: 'KPI cell',
        props: [
          { name: 'value', required: true, description: 'main figure (string)' },
          { name: 'label', required: false, description: 'small uppercase label' },
          { name: 'delta', required: false, description: '"+24%" green / "-0.5pp" red (sign picks color)' },
        ],
        example: '<Stat value="72" label="Sessions" delta="+38%" />',
      },
      {
        name: 'Card',
        description: 'Themed content card with Markdown children and an optional asset reference (image/video/audio preview or file link)',
        props: [
          { name: 'title', required: false, description: 'card heading; provide a title, asset or children' },
          { name: 'subtitle', required: false, description: 'muted text below the heading' },
          { name: 'asset', required: false, description: 'document-relative sibling asset path or HTTPS media/file URL; resolved in the current local/broker scope' },
          { name: 'assetType', required: false, description: 'image | video | audio | file; inferred from the extension when omitted' },
          { name: 'alt', required: false, description: 'image alt text or media accessibility label; defaults to title or asset path' },
          { name: 'children', required: false, description: 'Markdown body, including nested built-in components' },
        ],
        example: '<Card title="Product" asset="images/product.webp" alt="Product front view">\nDescription in **Markdown**.\n</Card>',
      },
      {
        name: 'Cards',
        description: 'Responsive grid of cards; stacks into one column on mobile',
        props: [
          { name: 'columns', required: false, description: 'integer 1-4; omitted uses an auto-fitting grid' },
          { name: 'children', required: true, description: 'one or more Card components' },
        ],
        example: '<Cards columns={2}>\n<Card title="First">First item.</Card>\n<Card title="Second">Second item.</Card>\n</Cards>',
      },
      {
        name: 'Carousel',
        description: 'Scrollable slides with previous/next controls and ArrowLeft/ArrowRight/Home/End keyboard navigation; no autoplay and readable without JavaScript',
        props: [
          { name: 'title', required: false, description: 'visible title and accessible carousel label' },
          { name: 'perView', required: false, description: 'integer 1-3 (default 1); mobile always shows one slide' },
          { name: 'children', required: true, description: 'block slides, typically Card components with asset references' },
        ],
        example: '<Carousel title="Gallery">\n<Card title="Front" asset="images/front.webp" />\n<Card title="Back" asset="images/back.webp" />\n</Carousel>',
      },
      {
        name: 'Table',
        description: 'Accessible, read-only table with a caption and horizontally scrollable region; accepts literal rows/columns or a Markdown table as children',
        props: [
          { name: 'title', required: false, description: 'table caption and accessible region label' },
          { name: 'columns', required: false, description: '1-24 labels or { key, label, align? } objects; align is left | center | right; required with rows' },
          { name: 'rows', required: false, description: 'up to 500 array rows matching columns, or object rows keyed by columns; scalar cells only, max 4,096 chars per cell and 512,000 chars total' },
          { name: 'children', required: false, description: 'Markdown table instead of rows/columns; do not combine the two modes' },
        ],
        example: '<Table title="Formats" columns={["Format", "Entry"]} rows={[["MDX", "index.mdx"], ["Markdown", "index.md"]]} />',
      },
      {
        name: 'Pages',
        description: 'Multi-page artifact navigation using native sibling-file links, current-page highlighting and previous/next controls',
        props: [
          { name: 'title', required: false, description: 'navigation heading and accessible label' },
          { name: 'items', required: true, description: '1-50 unique { title, href, description? } items; href is a safe relative .mdx, .md or .html path' },
        ],
        example: '<Pages title="Contents" items={[{ title: "Overview", href: "index.mdx" }, { title: "Details", href: "details.mdx" }]} />',
      },
      {
        name: 'Webframe',
        description: 'Browser-like embed of a sibling file of the same artifact (wireframes, mock HTML)',
        props: [
          { name: 'src', required: true, description: 'artifact-relative path, e.g. "wireframe.html" (never absolute/external)' },
          { name: 'title', required: false, description: 'accessibility/frame title' },
          { name: 'height', required: false, description: 'px, 160-720 (default 360)' },
        ],
        example: '<Webframe src="wireframe.html" height={420} />',
      },
      {
        name: 'Video',
        description: 'Native video playback from a sibling file or https URL (mp4, webm, ogv, mov, mkv)',
        props: [
          { name: 'src', required: true, description: 'artifact-relative path, e.g. "clip.mp4", or https URL' },
          { name: 'title', required: false, description: 'caption under the player' },
          { name: 'poster', required: false, description: 'cover image, same src rules as src' },
          { name: 'controls', required: false, description: 'show controls (default true)' },
          { name: 'autoplay', required: false, description: 'autoplay muted inline (default false)' },
          { name: 'loop', required: false, description: 'loop playback (default false)' },
          { name: 'muted', required: false, description: 'start muted (default false)' },
        ],
        example: '<Video src="clip.mp4" title="Demo de la ruta" />',
      },
      {
        name: 'Audio',
        description: 'Native audio playback from a sibling file or https URL (mp3, wav, ogg, m4a, aac, flac, opus)',
        props: [
          { name: 'src', required: true, description: 'artifact-relative path, e.g. "nota.mp3", or https URL' },
          { name: 'title', required: false, description: 'label next to the player' },
          { name: 'controls', required: false, description: 'show controls (default true)' },
          { name: 'autoplay', required: false, description: 'autoplay muted (default false)' },
          { name: 'loop', required: false, description: 'loop playback (default false)' },
          { name: 'muted', required: false, description: 'start muted (default false)' },
        ],
        example: '<Audio src="nota.mp3" title="Resumen en audio" />',
      },
      {
        name: 'Callout',
        description: 'Highlighted note; children are rendered as markdown',
        props: [
          { name: 'type', required: false, description: 'info (default) | warning | success | danger' },
          { name: 'title', required: false, description: 'bold heading' },
          { name: 'children', required: false, description: 'markdown body' },
        ],
        example: '<Callout type="warning" title="Careful">**Read this.**</Callout>',
      },
      {
        name: 'Section',
        description: 'Named card section; its title joins the Secciones sidebar index',
        props: [
          { name: 'title', required: true, description: 'section heading (becomes the #anchor, accents stripped)' },
          { name: 'id', required: false, description: 'custom anchor (default: slug of the title)' },
          { name: 'subtitle', required: false, description: 'muted line under the heading' },
          { name: 'children', required: false, description: 'markdown body' },
        ],
        example: '<Section title="Qué es">Prose, lists, even <Chart /> inside.</Section>',
      },
      {
        name: 'Svg',
        description: 'Simple theme-aware inline SVG from literal box/circle/arrow/line/text data; use a native lowercase <svg> block for detailed architecture layouts',
        props: [
          { name: 'shapes', required: true, description: 'up to 40 {type: box|circle|arrow|line|text, ...coords, label?, color?} shapes; coordinates are canvas units' },
          { name: 'width', required: false, description: 'canvas px, 240-860 (default 640)' },
          { name: 'height', required: false, description: 'canvas px, 120-520 (default 220)' },
          { name: 'title', required: false, description: 'caption above the graphic' },
        ],
        example: '<Svg shapes={[{ type: "box", x: 10, y: 30, w: 150, h: 70, label: "Entrega" }]} />',
      },
      {
        name: 'TaskList',
        description: 'Read-only work-item list from a version-1 JSON snapshot (literal data or sibling src). Flat list preserving item order, or grouped when groupBy="group"',
        props: [
          { name: 'data', required: false, description: 'literal version-1 dataset object (exactly one of data | src)' },
          { name: 'src', required: false, description: 'sibling .json path, e.g. "tasks.json" — document-relative, same-origin, loaded by the viewer runtime' },
          { name: 'groupBy', required: false, description: '"group" groups items under their declared group labels (Ungrouped last); omitted keeps item order' },
          { name: 'title', required: false, description: 'caption above the list' },
        ],
        example: '<TaskList src="tasks.json" groupBy="group" title="Work items" />',
      },
      {
        name: 'Kanban',
        description: 'Read-only status board from a version-1 JSON snapshot: one column per declared column, in declared order (no drag-and-drop, no status writes)',
        props: [
          { name: 'data', required: false, description: 'literal version-1 dataset object (exactly one of data | src)' },
          { name: 'src', required: false, description: 'sibling .json path, e.g. "tasks.json" — document-relative, same-origin, loaded by the viewer runtime' },
          { name: 'title', required: false, description: 'caption above the board' },
        ],
        example: '<Kanban src="tasks.json" title="Status board" />',
      },
      {
        name: 'Properties',
        description: 'Read-only list of labeled scalar values (string/number/boolean/null) from a version-1 JSON snapshot, optionally sectioned by entry group',
        props: [
          { name: 'data', required: false, description: 'literal version-1 dataset object (exactly one of data | src)' },
          { name: 'src', required: false, description: 'sibling .json path, e.g. "profile.json" — document-relative, same-origin, loaded by the viewer runtime' },
          { name: 'title', required: false, description: 'caption above the property list' },
        ],
        example: '<Properties src="profile.json" title="Execution profile" />',
      },
    ],
    features: [
      'GFM: tables, task lists, strikethrough, autolinks',
      'media: images via ![alt](asset.png) or ![alt](https://...) (png, jpg, gif, webp, avif, svg); video via <Video src="clip.mp4" /> and audio via <Audio src="nota.mp3" /> (sibling file or https URL); links via [text](https://...)',
      'collections: Card/Cards support Markdown bodies and asset references; Carousel adds responsive scroll-snap, accessible controls, keyboard navigation and reduced-motion support without autoplay',
      'tables: existing GFM tables remain supported; Table adds captions and literal rows/columns with escaped scalar cells and explicit size limits',
      'multi-page artifacts: index.mdx is the entry; sibling .mdx/.md/.html pages render through the same local and broker routes. Pages provides a reusable navigation map with current-page and previous/next links; native navigation works without JavaScript',
      'page links keep the selected theme; Copy for agent identifies the currently loaded sibling page and its source path, while retaining the entry source reference',
      'fenced code with syntax highlighting',
      'mermaid diagrams via ```mermaid fences',
      'graphics expand: Chart, Svg, native inline SVG and mermaid diagrams have an ⤢ button. Click the same button to close, or use ESC/backdrop; wide inline SVGs retain natural canvas width with scrolling',
      'sections index: 3+ headings (h1-h3) get anchor ids and a Secciones sidebar with scroll-spy and a filter search box (sticky on desktop, stacked on mobile); <Section> titles join it automatically',
      'frontmatter title/type feed the sidebar label and artifact type',
      'dark/light theme follows the dashboard (?theme=dark|light)',
      '?raw=1 serves the plain source',
      'MDX: module-level import/export and {/* comments */} hidden',
      'MDX: props must be literals (viewer executes no code); unknown components render as visible placeholders',
      'MDX inline SVG: lowercase block-level <svg viewBox="0 0 960 380">...</svg> renders directly, including in Card/Section. Blank lines and fence-looking SVG text stay XML; genuine code fences remain code',
      'inline SVG supports static groups, shapes, paths, defs/markers, gradients, clipping, masks, text/tspan and document-relative assets/page links. IDs and local references are namespaced per diagram',
      'inline SVG uses quoted XML attributes, not JSX expressions/style objects. Scripts, event attributes, foreignObject, style blocks, animation and remote resources are removed; use targets must be local primitive shapes without element children',
      'inline SVG limits: 512 KiB, 2,048 elements, 40 nesting levels and positive viewBox width/height up to 4,096; invalid XML, DTD/entities, duplicate IDs and oversized canvases produce visible errors',
      'versioned store: artifact_create/artifact_update create v001, v002...',
      'folder standard: sibling files are first-class — reference them by relative path (asset.png, notes.md); .md/.mdx siblings render as viewer sub-routes, .html siblings are browsable or embeddable via <Webframe>',
      'assets: attach with the artifact_asset tool (bytes in the store, served at /artifacts/<slug>/<name>); symlinked folders also work',
      'data views: TaskList/Kanban/Properties take a version-1 JSON snapshot via literal data={...} (server-rendered) or sibling src="tasks.json" (document-relative, same-origin, fetched by the viewer at render time)',
      'data view limits: 1 MiB UTF-8 JSON per src, 1,000 items, 50 columns, 100 groups, 100 property entries, 256 chars per id/title/label, 4,096 per description/value; over-limit data fails visibly instead of being silently truncated',
      'data view failures are visible per component (role="alert" error card naming the component and the reason): unsupported version, data+src together, duplicate ids, unknown column/group references, malformed or oversized values — never a crash or a blank section',
      'data views are snapshots, not live: generatedAt/sourceLabel are display-only metadata; nothing re-renders on its own and there is no connection to plan files or external systems',
      'data view links: item href accepts only document-relative safe paths or #fragments; src resolves against the current MDX document, never against the JSON file',
      'data views are read-only: no write-back, no drag-and-drop, no automatic status transitions',
    ],
    usageGuidance: usageGuidance(),
    mermaid: {
      supported: true,
      usage: 'fenced code block with language `mermaid` (flowchart, sequence, class, state, er, gantt, pie, ...); pie labels must be quoted: `"md" : 31`',
      note: 'rendered client-side from the daemon-served bundle; raw source stays visible when JS is unavailable',
    },
    guidePath: '/mdx-guide',
    cliCommand: 'artifact capabilities [--json]',
  };
}

function usageGuidance(): string[] {
  return [
    'Prefer mdx for documents (same markdown plus components); md only for plain prose with no visuals; html only for standalone interactive pages.',
    'For large MDX artifacts, split by coherent topic: index.mdx is a concise overview, details.mdx and other sibling pages carry chapters/appendices. Avoid arbitrary splits that make readers jump unnecessarily.',
    'Put the same literal <Pages items={[{ title, href, description? }, ...]} /> map on each page, using flat sibling filenames so every relative link resolves consistently. Give each page a clear heading and link related content.',
    'Use artifact_create/artifact_update for the versioned entry and artifact_asset for sibling page files and supporting assets. Sibling pages/assets use stable filenames and are not independently versioned.',
    'Default to prose: a visual must do work text cannot.',
    'Diagram only for real structure (3+ interacting steps/actors, architecture, state transitions) — one per document max.',
    'Chart only with REAL data from the task/repo/conversation; never invent numbers to justify a chart.',
    'Choose Chart for measured data, Svg shapes for a few simple nodes, and native inline <svg> for detailed architecture/flow diagrams. Never encode a flow as invented bar/line metrics.',
    'For charts, provide finite numeric values, explicit units, chronological order for trends, and 1-4 readable series with compatible units. Keep exact or large datasets in a Table.',
    'For architecture graphics, name verified actors/systems and which system owns the truth; place boxes before routing labeled arrows around text. Use g/defs/markers/tspan for grouping, arrowheads and multiline labels.',
    'Use a 960-1200 unit viewBox with quoted XML attributes, readable 16-20 unit SVG labels, title/desc with aria-labelledby, viewer palette vars, and consistent labeled line/color meaning. Place the raw SVG block outside code fences; authored SVG/JSX expressions are not evaluated.',
    'Linear steps -> numbered list; comparison -> table; anything explainable in a sentence -> prose.',
    'Data views (TaskList/Kanban/Properties): explicitly select safe fields for the JSON snapshot — exclude credentials, tokens and secrets; nothing is auto-redacted.',
    'Never imply a data view is connected to a live plan or system: it is a frozen snapshot, and generatedAt/sourceLabel are display-only metadata.',
  ];
}

/** Human-readable rendering for `artifact capabilities`. */
export function formatCapabilitiesText(caps: ViewerCapabilities, guideUrl: string | null): string {
  const lines: string[] = ['Artifact viewer capabilities', ''];
  lines.push('Formats');
  for (const f of caps.formats) {
    lines.push(`  ${f.format.padEnd(5)} ${f.entryFile.padEnd(11)} ${f.description}`);
  }
  lines.push('', 'Built-in MDX components (props must be literals)');
  for (const comp of caps.components) {
    const props = comp.props.map((p) => `${p.name}${p.required ? '' : '?'}`).join(', ');
    lines.push(`  ${comp.name.padEnd(8)} (${props}) — ${comp.description}`);
    lines.push(`           ${comp.example}`);
  }
  lines.push('', 'Diagrams');
  lines.push(`  mermaid   ${caps.mermaid.usage}`);
  lines.push(`            ${caps.mermaid.note}`);
  lines.push('', 'Viewer features');
  for (const feat of caps.features) {
    lines.push(`  - ${feat}`);
  }
  lines.push('', 'Usage guidance (relevance filter)');
  for (const rule of caps.usageGuidance) {
    lines.push(`  - ${rule}`);
  }
  lines.push('', `Live guide: ${guideUrl ?? `not running — start it with artifact start, then open ${caps.guidePath}`}`);
  lines.push('Machine-readable: artifact capabilities --json');
  return lines.join('\n');
}
