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

  it('dedupes repeated titles and strips accents', () => {
    const page = renderMarkdownViewer('## Café\n\nx\n\n## Café\n\nx\n\n## Otro\n\nx\n', { slug: 'd', format: 'md' });
    expect(page).toContain('id="cafe"');
    expect(page).toContain('id="cafe-2"');
  });
});
