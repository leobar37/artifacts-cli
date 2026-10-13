import { describe, it, expect } from 'vitest';
import { renderMdxComponent } from '../mdx-components.js';
import { renderMarkdownBody, renderMarkdownViewer, getMdxGuideSource } from '../markdown-viewer.js';

const CAROUSEL = [
  '<Carousel title="Gallery" perView={2}>',
  '<Card title="First" asset="images/cover.svg" alt="Cover">**First** item.</Card>',
  '<Card title="Second">Second item.</Card>',
  '<Card title="Third">Third item.</Card>',
  '</Carousel>',
].join('\n');

describe('Card and Cards', () => {
  it('renders Markdown bodies and nested components, without executing JSX expressions', () => {
    const body = renderMarkdownBody('<Card title="Summary" subtitle="Details">\n**Bold** content.\n\n<Stat value="12" label="Items" />\n</Card>', 'mdx');
    expect(body).toContain('class="mv-card"');
    expect(body).toContain('<strong>Bold</strong>');
    expect(body).toContain('mv-stat-value');
    expect(body).not.toContain('mv-comp-tag');
    expect(renderMarkdownBody('<Card title={computedTitle} />', 'mdx')).toContain('mv-comp-tag');
  });

  it.each([
    ['images/cover.webp', '<img'], ['images/diagram.svg', '<img'],
    ['clip.mp4', '<video'], ['audio/notes.mp3', '<audio'], ['notes.pdf', '<a'],
  ])('references sibling asset %s using %s', (asset, element) => {
    const body = renderMdxComponent('Card', { title: 'Asset', asset }, '');
    expect(body).toContain(element);
    expect(body).toContain(asset);
    expect(body).not.toContain('role="alert"');
  });

  it('accepts HTTPS assets and explicit media types for extensionless URLs', () => {
    const body = renderMdxComponent('Card', { title: 'Photo', asset: 'https://cdn.example.com/file?id=12', assetType: 'image', alt: 'Product' }, '');
    expect(body).toContain('<img');
    expect(body).toContain('alt="Product"');
    expect(renderMdxComponent('Card', { asset: 'audio.ogg', assetType: 'audio' }, '')).toContain('<audio');
  });

  it.each(['../secret.png', '%2e%2e/secret.png', '%252e%252e/secret.png', '/secret.png', '//evil.example/x.png', 'javascript:alert(1)', 'data:image/png;base64,a', 'http://example.com/a.png', 'https://user:pass@example.com/a.png', 'images\\bad.png'])('rejects unsafe asset %s visibly', (asset) => {
    expect(renderMdxComponent('Card', { asset }, '')).toContain('role="alert"');
  });

  it('escapes metadata and attribute-breakout payloads', () => {
    const body = renderMdxComponent('Card', { title: '<script>bad</script>', asset: 'photo" onerror="alert(1).png', alt: 'a"b<c>' }, '');
    expect(body).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(body).toContain('alt="a&quot;b&lt;c&gt;"');
    expect(body).not.toContain(' onerror="');
    expect(body).not.toContain('<script>bad');
  });

  it('validates empty cards, unsupported asset types and grid bounds', () => {
    expect(renderMdxComponent('Card', {}, '')).toContain('role="alert"');
    expect(renderMdxComponent('Card', { asset: 'photo.png', assetType: 'iframe' }, '')).toContain('role="alert"');
    expect(renderMdxComponent('Card', { assetType: 'image', title: 'No asset' }, '')).toContain('role="alert"');
    expect(renderMdxComponent('Cards', { columns: 4 }, '<article>one</article>')).toContain('--card-columns:4');
    expect(renderMdxComponent('Cards', { columns: 0 }, 'content')).toContain('role="alert"');
    expect(renderMdxComponent('Cards', { columns: '2' }, 'content')).toContain('role="alert"');
  });
});

describe('Carousel', () => {
  it('renders real card slides, native scrolling markup and conditional enhancement', () => {
    const page = renderMarkdownViewer(CAROUSEL, { slug: 'gallery', format: 'mdx' });
    expect(page).toContain('aria-roledescription="carousel"');
    expect(page).toContain('aria-label="Previous slide"');
    expect(page).toContain('aria-label="Next slide"');
    expect(page).toContain('tabindex="0"');
    expect(page).toContain('mvBootCarousels');
    expect(page).toContain('prefers-reduced-motion');
    expect(page.match(/<article class="mv-card">/g)).toHaveLength(3);
    expect(page).toContain('src="images/cover.svg"');
    expect(page).not.toContain('autoplay');
    expect(renderMarkdownViewer('# Plain', { slug: 'plain', format: 'mdx' })).not.toContain('mvBootCarousels');
  });

  it('rejects blank slides and invalid perView instead of emitting broken controls', () => {
    expect(renderMdxComponent('Carousel', {}, '')).toContain('role="alert"');
    for (const perView of [0, 4, 1.5, '2', null]) {
      expect(renderMdxComponent('Carousel', { perView }, 'content')).toContain('role="alert"');
    }
  });
});

describe('Table', () => {
  it('renders array rows with captions and scoped headers, preserving zero, false and null', () => {
    const body = renderMdxComponent('Table', { title: 'Data', columns: ['Count', 'Enabled', 'Note'], rows: [[0, false, null]] }, '');
    expect(body).toContain('<caption>Data</caption>');
    expect(body).toContain('scope="col"');
    expect(body).toContain('>0</td>');
    expect(body).toContain('>false</td>');
    expect(body).toContain('>—</td>');
  });

  it('renders keyed rows and declared alignment while escaping scalar HTML', () => {
    const body = renderMdxComponent('Table', { columns: [{ key: 'name', label: 'Name' }, { key: 'price', label: 'Price', align: 'right' }], rows: [{ name: '<img src=x onerror=bad>', price: 12 }] }, '');
    expect(body).toContain('&lt;img src=x onerror=bad&gt;');
    expect(body).toContain('mv-table-right');
    expect(body).not.toContain('<img');
  });

  it('wraps Markdown table children and leaves plain GFM tables supported', () => {
    const source = '<Table title="Comparison">\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n</Table>';
    const body = renderMarkdownBody(source, 'mdx');
    expect(body).toContain('class="mv-table"');
    expect(body).toContain('<caption>Comparison</caption>');
    expect(body).not.toContain('mv-comp-tag');
    expect(renderMarkdownBody('| A | B |\n| --- | --- |\n| 1 | 2 |', 'md')).toContain('<table>');
    expect(renderMdxComponent('Table', { columns: ['A'], rows: [[1]] }, '<table></table>')).toContain('role="alert"');
  });

  it('shows empty data explicitly and rejects malformed or oversized data', () => {
    expect(renderMdxComponent('Table', { columns: ['A'], rows: [] }, '')).toContain('No rows');
    for (const props of [
      { columns: [], rows: [] }, { columns: ['A', 'A'], rows: [] },
      { columns: ['A'], rows: [[1, 2]] }, { columns: ['A'], rows: [[{ nested: true }]] },
      { columns: ['A'], rows: [[Infinity]] }, { columns: ['A'], rows: [['x'.repeat(4097)]] },
      { columns: ['A'], rows: Array.from({ length: 501 }, () => [1]) },
    ]) expect(renderMdxComponent('Table', props, '')).toContain('role="alert"');
  });
});

describe('Pages', () => {
  it('renders scoped native page links and includes enhancement only when needed', () => {
    const source = '<Pages title="Guide" items={[{ title: "Overview", href: "index.mdx" }, { title: "Details", href: "details.mdx", description: "Full explanation" }]} />';
    const page = renderMarkdownViewer(source, { slug: 'guide', format: 'mdx' });
    expect(page).toContain('class="mv-pages"');
    expect(page).toContain('href="details.mdx"');
    expect(page).toContain('Full explanation');
    expect(page).toContain('mvBootPages');
    expect(page).toContain('aria-current');
    expect(page).toContain('Next page');
    expect(page).toContain("target.searchParams.set('theme', theme)");
    expect(renderMarkdownViewer('# Plain', { slug: 'plain', format: 'mdx' })).not.toContain('mvBootPages');
  });

  it.each(['../other.mdx', '%2e%2e/other.mdx', '/other.mdx', 'https://example.com/other.mdx', '#part', 'data.json'])('rejects out-of-scope or non-page href %s', (href) => {
    expect(renderMdxComponent('Pages', { items: [{ title: 'Page', href }] }, '')).toContain('role="alert"');
  });

  it('rejects missing, duplicate or excessive page entries', () => {
    expect(renderMdxComponent('Pages', { items: [] }, '')).toContain('role="alert"');
    expect(renderMdxComponent('Pages', { items: [{ title: 'A', href: 'a.mdx' }, { title: 'B', href: 'a.mdx' }] }, '')).toContain('role="alert"');
    expect(renderMdxComponent('Pages', { items: Array.from({ length: 51 }, (_, i) => ({ title: `Page ${i}`, href: `${i}.mdx` })) }, '')).toContain('role="alert"');
  });
});

it('renders all new live guide examples without component errors', () => {
  const body = renderMarkdownBody(getMdxGuideSource(), 'mdx');
  expect(body).toContain('class="mv-card"');
  expect(body).toContain('class="mv-carousel"');
  expect(body).toContain('class="mv-table"');
  expect(body).toContain('class="mv-graph mv-svg mv-svg-inline"');
  // The guide intentionally includes a failing TaskList to demonstrate validation.
  expect(body).not.toMatch(/mv-data-error-title">(?:Card|Cards|Carousel|Table|Pages|Inline SVG):/);
});
