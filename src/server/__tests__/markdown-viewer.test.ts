import { describe, it, expect } from 'vitest';
import { renderMarkdownBody, renderMarkdownViewer, escapeHtml } from '../markdown-viewer.js';

describe('renderMarkdownBody', () => {
  it('renders GFM: headings, tables, task lists', () => {
    const html = renderMarkdownBody('# Title\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n', 'md');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<table>');
    expect(html).toContain('<input');
    expect(html).toContain('type="checkbox"');
  });

  it('strips YAML frontmatter from the body', () => {
    const html = renderMarkdownBody('---\ntitle: Hidden\n---\n\n# Visible\n', 'md');
    expect(html).toContain('Visible');
    expect(html).not.toContain('Hidden');
  });

  it('highlights fenced code with a known language', () => {
    const html = renderMarkdownBody('```ts\nconst x: number = 1;\n```', 'md');
    expect(html).toContain('<pre><code class="language-ts">');
    expect(html).toContain('hljs-');
  });

  it('escapes unknown-language code instead of guessing', () => {
    const html = renderMarkdownBody('```notalang\n<script>alert(1)</script>\n```', 'md');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('hljs-');
  });

  it('hides mdx import/export statements outside fences', () => {
    const html = renderMarkdownBody('import { Chart } from "./c"\n\nexport const x = 1\n\n# Doc\n', 'mdx');
    expect(html).toContain('<h1>Doc</h1>');
    expect(html).not.toContain('import { Chart }');
    expect(html).not.toContain('export const x');
  });

  it('keeps import/export lines that live inside fenced code', () => {
    const source = '```ts\nimport { x } from "y";\n```\n';
    const html = renderMarkdownBody(source, 'mdx');
    // highlight.js wraps tokens in spans, so assert on structure, not raw text.
    expect(html).toContain('language-ts');
    expect(html).toContain('hljs-keyword');
  });
});

describe('renderMarkdownBody mermaid', () => {
  it('turns ```mermaid fences into diagram containers', () => {
    const html = renderMarkdownBody('```mermaid\nflowchart LR\n  A-->B\n```\n', 'md');
    expect(html).toContain('<div class="mv-mermaid">flowchart LR');
    expect(html).not.toContain('<pre><code class="language-mermaid"');
  });

  it('keeps normal code fences as highlighted blocks', () => {
    const html = renderMarkdownBody('```ts\nconst x = 1;\n```\n', 'md');
    expect(html).toContain('language-ts');
    expect(html).not.toContain('mv-mermaid');
  });
});

describe('renderMarkdownBody code snippets', () => {
  it('highlights shell scripts with keywords', () => {
    const html = renderMarkdownBody('```bash\nif [ -f x ]; then\n  echo ok\nfi\n```\n', 'md');
    expect(html).toContain('language-bash');
    expect(html).toContain('hljs-');
  });

  it('leaves language-less fences as plain escaped text', () => {
    const html = renderMarkdownBody('```\n<a>&</a>\n```\n', 'md');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('&lt;a&gt;&amp;&lt;/a&gt;');
    expect(html).not.toContain('hljs-');
  });
});

describe('renderMarkdownViewer expandable graphics', () => {
  it('wraps mermaid diagrams in a figure with an expand button', () => {
    const html = renderMarkdownBody('```mermaid\npie title T\n  "A" : 1\n```\n', 'md');
    expect(html).toContain('<figure class="mv-graph mv-diagram">');
    expect(html).toContain('class="mv-expand"');
    expect(html).toContain('<div class="mv-mermaid">pie title T');
  });

  it('includes the overlay script only when the page has graphics', () => {
    const withGraph = renderMarkdownViewer('```mermaid\nflowchart LR\n  A-->B\n```\n', { slug: 'd', format: 'md' });
    expect(withGraph).toContain('class="mv-expand"');
    expect(withGraph).toContain('mv-lock');
    expect(withGraph).toContain('Escape');
    const plain = renderMarkdownViewer('# plain\n\ntext\n', { slug: 'p', format: 'md' });
    expect(plain).not.toContain('<button class="mv-expand"');
    expect(plain).not.toContain('document.body.classList');
  });
});

describe('renderMarkdownViewer mermaid boot', () => {
  it('loads the mermaid bundle only when the page has diagrams', () => {
    const withDiagram = renderMarkdownViewer('```mermaid\nflowchart LR\n  A-->B\n```\n', { slug: 'd', format: 'md' });
    const withoutDiagram = renderMarkdownViewer('# plain\n', { slug: 'p', format: 'md' });
    expect(withDiagram).toContain('src="/assets/mermaid.min.js"');
    expect(withDiagram).toContain('mermaid.run');
    expect(withoutDiagram).not.toContain('/assets/mermaid.min.js');
  });
});

describe('renderMarkdownBody mdx components', () => {
  it('hides expression comments {/* ... */}', () => {
    const html = renderMarkdownBody('Text {/* secret note */} more\n', 'mdx');
    expect(html).toContain('Text');
    expect(html).not.toContain('secret note');
  });

  it('renders self-closing components as a visible placeholder', () => {
    const html = renderMarkdownBody('<Chart data={sales} height={240} />\n', 'mdx');
    expect(html).toContain('mv-comp-tag');
    expect(html).toContain('&lt;Chart /&gt;');
  });

  it('renders unknown component children as markdown inside the placeholder', () => {
    const html = renderMarkdownBody('<Panel type="warning">\n  Migration **in progress**\n</Panel>\n', 'mdx');
    expect(html).toContain('mv-comp-tag">&lt;Panel&gt;');
    expect(html).toContain('<strong>in progress</strong>');
  });

  it('renders known Callout as a styled callout, not a placeholder', () => {
    const html = renderMarkdownBody('<Callout type="warning">\n  Migration **in progress**\n</Callout>\n', 'mdx');
    expect(html).toContain('mv-callout--warning');
    expect(html).toContain('<strong>in progress</strong>');
    expect(html).not.toContain('mv-comp-tag');
  });

  it('handles nested JSX inside component children', () => {
    const html = renderMarkdownBody('<Card>\n  # Title\n  <Badge new />\n</Card>\n', 'mdx');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('&lt;Badge /&gt;');
  });

  it('leaves lowercase HTML untouched (not a component)', () => {
    const html = renderMarkdownBody('<details>\n<summary>More</summary>\nhidden\n</details>\n', 'mdx');
    expect(html).toContain('<details>');
    expect(html).not.toContain('mv-comp');
  });

  it('renders Video/Audio components end-to-end, images stay markdown', () => {
    const html = renderMarkdownBody('<Video src="clip.mp4" title="Demo" />\n\n<Audio src="nota.mp3" />\n\n![shot](asset.png)\n', 'mdx');
    expect(html).toContain('<video');
    expect(html).toContain('src="clip.mp4"');
    expect(html).toContain('<audio');
    expect(html).toContain('src="nota.mp3"');
    expect(html).toContain('src="asset.png"');
  });
});

describe('renderMarkdownViewer', () => {
  it('wraps the body in a standalone page with slug and format badge', () => {
    const page = renderMarkdownViewer('# Hi\n', { slug: 'notes', format: 'md' });
    expect(page).toMatch(/^<!doctype html>/);
    expect(page).toContain('data-theme="dark"');
    expect(page).toContain('mv-slug">notes');
    expect(page).toContain('mv-format">md');
    expect(page).toContain('href="?raw=1"');
    expect(page).toContain('<h1 id="hi">Hi');
  });

  it('light theme flips data-theme and inlines the light palette', () => {
    const page = renderMarkdownViewer('# Hi\n', { slug: 'n', format: 'md', theme: 'light' });
    expect(page).toContain('data-theme="light"');
    expect(page).toContain('--bg: #ffffff');
  });

  it('escapes the slug in the page shell', () => {
    const page = renderMarkdownViewer('x', { slug: 'a"<script>', format: 'md' });
    expect(page).not.toContain('a"<script>');
    expect(page).toContain('a&quot;&lt;script&gt;');
  });
});

describe('escapeHtml', () => {
  it('escapes the dangerous five', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});

describe('renderMarkdownViewer sections index', () => {
  const long = '# T\n\n## Uno\n\nx\n\n## Dos\n\nx\n\n### Detalle\n\nx\n';

  it('adds anchor ids to headings', () => {
    const page = renderMarkdownViewer(long, { slug: 'doc', format: 'md' });
    expect(page).toContain('<h2 id="uno">Uno');
    expect(page).toContain('<h2 id="dos">Dos');
    expect(page).toContain('<h3 id="detalle">Detalle');
  });

  it('renders the Secciones sidebar for long docs, not for short ones', () => {
    const withToc = renderMarkdownViewer(long, { slug: 'doc', format: 'md' });
    expect(withToc).toContain('aria-label="Secciones"');
    expect(withToc).toContain('<a href="#uno">Uno</a>');
    expect(withToc).toContain('<a href="#detalle">Detalle</a>');
    const short = renderMarkdownViewer('# Hi\n', { slug: 'doc', format: 'md' });
    expect(short).not.toContain('aria-label="Secciones"');
  });

  it('ships a filter search box with an empty state', () => {
    const page = renderMarkdownViewer('# T\n\n## Uno\n\nx\n\n## Dos\n\nx\n\n## Tres\n\nx\n', { slug: 'doc', format: 'md' });
    expect(page).toContain('class="mv-toc-search"');
    expect(page).toContain('Filtrar secciones');
    expect(page).toContain('mv-toc-empty');
    expect(page).toContain('Sin coincidencias');
  });

  it('wires the scroll-spy script only when the sidebar renders', () => {
    const withToc = renderMarkdownViewer('# T\n\n## Uno\n\nx\n\n## Dos\n\nx\n\n## Tres\n\nx\n', { slug: 'doc', format: 'md' });
    expect(withToc).toContain('IntersectionObserver');
    const short = renderMarkdownViewer('# Hi\n', { slug: 'doc', format: 'md' });
    expect(short).not.toContain('IntersectionObserver');
    expect(short).not.toContain('<input class="mv-toc-search"');
  });

  it('dedupes repeated titles and strips accents', () => {
    const page = renderMarkdownViewer('## Café\n\nx\n\n## Café\n\nx\n\n## Otro\n\nx\n', { slug: 'd', format: 'md' });
    expect(page).toContain('id="cafe"');
    expect(page).toContain('id="cafe-2"');
  });

  it('rewrites colliding explicit ids so every TOC link has an element', () => {
    const page = renderMarkdownViewer('<h2 id="dup">Uno</h2>\n\n<h2 id="dup">Dos</h2>\n\n## Tres\n', { slug: 'd', format: 'md' });
    expect(page).toContain('<h2 id="dup">Uno');
    expect(page).toContain('<h2 id="dup-2">Dos');
    expect(page).toContain('<a href="#dup-2">Dos</a>');
  });
});

describe('renderMarkdownBody data views', () => {
  it('renders a TaskList with inline literal data, grouped and escaped', () => {
    const mdx = [
      '<TaskList data={{ version: 1, columns: [{ id: \'pending\', label: \'Pending\' }], groups: [{ id: \'g1\', label: \'Phase 1\' }], items: [',
      "  { id: 'T-1', title: 'Prepare <fixtures>', status: 'pending', group: 'g1' },",
      "  { id: 'T-2', title: 'Relax', status: 'pending' },",
      '] }} groupBy=\'group\' title="Work items" />',
    ].join('\n');
    const html = renderMarkdownBody(mdx, 'mdx');
    expect(html).toContain('mv-tasklist');
    expect(html).toContain('mv-data-title">Work items');
    expect(html).toContain('mv-data-group-label">Phase 1');
    expect(html).toContain('Ungrouped');
    expect(html).toContain('Prepare &lt;fixtures&gt;');
    expect(html).not.toContain('<fixtures>');
  });

  it('renders Kanban and Properties from inline data', () => {
    const mdx = [
      '<Kanban data={{ version: 1, columns: [{ id: \'done\', label: \'Done\' }], items: [{ id: \'A\', title: \'Shipped\', status: \'done\' }] }} />',
      '',
      "<Properties data={{ version: 1, entries: [{ label: 'Worker', value: 'GLM 5.3 Flash' }] }} />",
    ].join('\n\n');
    const html = renderMarkdownBody(mdx, 'mdx');
    expect(html).toContain('mv-kanban-col-label">Done');
    expect(html).toContain('Shipped');
    expect(html).toContain('<dt>Worker</dt><dd>GLM 5.3 Flash</dd>');
  });

  it('renders the src placeholder without fetching or reading files', () => {
    const html = renderMarkdownBody('<TaskList src="tasks.json" title="Board" />\n', 'mdx');
    expect(html).toContain('class="mv-data mv-data-src"');
    expect(html).toContain('data-kind="tasklist"');
    expect(html).toContain('data-src="tasks.json"');
    expect(html).toContain('data-title="Board"');
    expect(html).toContain('<noscript>');
  });

  it('surfaces malformed props as component-level errors in the body', () => {
    const html = renderMarkdownBody(
      '<Kanban data={{ version: 1, columns: [] }} src="tasks.json" />\n',
      'mdx',
    );
    expect(html).toContain('mv-data-error');
    expect(html).toContain('role="alert"');
  });

  it('executes no code from data: hostile markup stays escaped', () => {
    const mdx =
      "<Properties data={{ version: 1, entries: [{ label: 'X', value: '<script>alert(1)</script>' }] }} />\n";
    const html = renderMarkdownBody(mdx, 'mdx');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html.toLowerCase()).not.toContain('<script>');
  });
});

describe('renderMarkdownViewer data view styles', () => {
  const mdx = '<TaskList src="tasks.json" />\n';

  it('ships theme-aware CSS for the data view classes', () => {
    const dark = renderMarkdownViewer(mdx, { slug: 'd', format: 'mdx' });
    expect(dark).toContain('mv-data-src"');
    for (const cls of ['.mv-data-error', '.mv-data-empty', '.mv-task', '.mv-kanban-columns', '.mv-prop']) {
      expect(dark).toContain(cls);
    }
    expect(dark).toContain('.mv-data a:focus-visible');
    expect(dark).toContain('@media (max-width: 390px)');
  });

  it('inlines the same data view styles in the light theme', () => {
    const light = renderMarkdownViewer(mdx, { slug: 'd', format: 'mdx', theme: 'light' });
    expect(light).toContain('data-theme="light"');
    expect(light).toContain('.mv-kanban-columns');
    expect(light).toContain('.mv-data-error');
  });
});
