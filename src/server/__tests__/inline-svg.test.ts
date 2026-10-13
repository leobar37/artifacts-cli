import { describe, it, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { renderInlineSvg, INLINE_SVG_LIMITS } from '../inline-svg.js';
import { renderMarkdownBody, renderMarkdownViewer } from '../markdown-viewer.js';
import { EXPAND_BUTTON } from '../mdx-components.js';

const SVG = [
  '<svg viewBox="0 0 960 320" role="img" aria-labelledby="diagram-title" xmlns="http://www.w3.org/2000/svg">',
  '<title id="diagram-title">People → Partners → Product</title>',
  '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="var(--muted)" /></marker></defs>',
  '',
  '<g transform="translate(20 30)">',
  '<rect width="240" height="120" rx="12" fill="var(--code-bg)" stroke="var(--border)" />',
  '<text x="120" y="45" text-anchor="middle" font-size="18" fill="var(--fg)">**Literal**, not Markdown</text>',
  '<text x="120" y="75" text-anchor="middle"><tspan x="120">API { contract }</tspan><tspan x="120" dy="24">import/export are labels</tspan></text>',
  '</g>',
  '',
  '<path d="M260 90 C320 90 320 130 380 130" fill="none" stroke="var(--muted)" marker-end="url(#arrow)" />',
  '</svg>',
].join('\n');

function svgElement(html: string) {
  const start = html.indexOf('<svg');
  const end = html.lastIndexOf('</svg>') + '</svg>'.length;
  return new DOMParser().parseFromString(html.slice(start, end), 'image/svg+xml').documentElement!;
}

describe('inline SVG in MDX', () => {
  it('renders groups, paths, markers and multiline labels without Markdown leaking into SVG', () => {
    const body = renderMarkdownBody(`# Diagram\n\n${SVG}\n\nAfter **the diagram**.`, 'mdx');
    expect(body).toContain('class="mv-graph mv-svg mv-svg-inline"');
    expect(body).toContain('aria-expanded="false"');
    expect(body).toContain('C320 90 320 130 380 130');
    expect(body).toContain('**Literal**, not Markdown');
    expect(body).not.toContain('<strong>Literal</strong>');
    expect(body).not.toContain('<p><svg');
    expect(body).toContain('After <strong>the diagram</strong>');
    const svg = svgElement(body);
    expect(svg.getElementsByTagName('tspan').length).toBe(2);
    expect(svg.getElementsByTagName('p').length).toBe(0);
    expect(svg.getElementsByTagName('pre').length).toBe(0);
    expect(svg.textContent).toContain('API { contract }');
  });

  it('namespaces IDs, marker URLs and accessible labels independently for repeated SVG blocks', () => {
    const body = renderMarkdownBody(`${SVG}\n\n${SVG}`, 'mdx');
    const ids = [...body.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(body).toMatch(/marker-end="url\(#mv-inline-\d+-arrow\)"/);
    expect(body).toMatch(/aria-labelledby="mv-inline-\d+-diagram-title"/);
  });

  it('supports SVG inside a Card and leaves the declarative Svg component intact', () => {
    const body = renderMarkdownBody(`<Card title="Architecture">\n${SVG}\n</Card>\n\n<Svg shapes={[{ type: "box", x: 10, y: 10, w: 100, h: 60, label: "Simple" }]} />`, 'mdx');
    expect(body).toContain('class="mv-card"');
    expect(body).toContain('class="mv-graph mv-svg mv-svg-inline"');
    expect(body).toContain('class="mv-graph mv-svg"');
    expect(body).not.toContain('mv-comp-tag');
  });

  it.each(['```', '````', '~~~'])('preserves SVG examples inside %s code fences', (fence) => {
    const body = renderMarkdownBody(`${fence}svg\n${SVG}\n${fence}`, 'mdx');
    expect(body).toContain('<pre><code');
    expect(body).not.toContain('<figure class="mv-graph');
    expect(body).not.toContain('mv-inline-');
  });

  it('uses XML tag boundaries even when attributes, comments or CDATA contain closing tags', () => {
    const source = '<svg viewBox="0 0 300 120"><!-- </svg> --><text x="10" y="30" aria-label="a > b"><![CDATA[</svg><script>not code</script>]]></text></svg>';
    const body = renderMarkdownBody(source, 'mdx');
    expect(body).not.toContain('role="alert"');
    expect(body).not.toContain('<script>not code');
    expect(svgElement(body).textContent).toContain('</svg><script>not code</script>');
  });

  it('includes expansion, native-width scrolling and working close-button behavior', () => {
    const page = renderMarkdownViewer(SVG, { slug: 'architecture', format: 'mdx' });
    expect(page).toContain('--svg-native-width:960px');
    expect(page).toContain('max(100%, var(--svg-native-width))');
    expect(page).toContain('Cerrar gráfico');
    expect(page).toContain('fig.classList.contains("open")');
    expect(page).toContain('position: sticky');
  });
});

describe('inline SVG safety and validation', () => {
  it('removes scripts, event handlers, HTML, animation and remote-resource attributes', () => {
    const html = renderInlineSvg('<svg viewBox="0 0 300 160" onload="bad()"><script>bad()</script><foreignObject><div>HTML</div></foreignObject><style>@import "https://evil.test/a.css";</style><animate attributeName="href" to="javascript:bad()" /><image href="https://evil.test/a.svg" /><use href="javascript:bad()" /><a href="javascript:bad()"><text x="10" y="50">Safe text</text></a><rect width="100" height="60" onclick="bad()" style="fill:red; background:url(https://evil.test/x); position:fixed" /></svg>', EXPAND_BUTTON);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(/<script|foreignObject|<style|<animate|onload=|onclick=|javascript:|evil\.test|position:fixed/);
    expect(html).toContain('fill:red');
    expect(html).toContain('Safe text');
  });

  it('allows sibling assets and document links but rejects traversal', () => {
    const html = renderInlineSvg('<svg viewBox="0 0 300 160"><image href="images/icon.svg" width="40" height="40" /><image href="%2e%2e/private.svg" /><a href="details.mdx"><text x="10" y="60">Details</text></a></svg>', EXPAND_BUTTON);
    expect(html).toContain('href="images/icon.svg"');
    expect(html).toContain('href="details.mdx"');
    expect(html).not.toContain('private.svg');
  });

  it('rewrites local gradient/style references and strips unsafe CSS values', () => {
    const html = renderInlineSvg('<svg viewBox="0 0 300 160"><defs><linearGradient id="paint"><stop offset="0" stop-color="red" /></linearGradient></defs><rect width="100" height="60" fill="url(#paint)" style="stroke:url(\"#paint\");font-size:16px" /></svg>', EXPAND_BUTTON);
    // Quotes in XML attributes must be entities, not backslash escapes.
    expect(html).toContain('role="alert"');
    const valid = renderInlineSvg('<svg viewBox="0 0 300 160"><defs><linearGradient id="paint"><stop offset="0" stop-color="red" /></linearGradient></defs><rect width="100" height="60" fill="url(#paint)" style="stroke:url(&quot;#paint&quot;);font-size:16px" /></svg>', EXPAND_BUTTON);
    expect(valid).toMatch(/fill="url\(#mv-inline-\d+-paint\)"/);
    expect(valid).toMatch(/stroke:url\(#mv-inline-\d+-paint\)/);
    expect(valid).toContain('font-size:16px');
  });

  it('accepts numeric dimensions, normalizes string aliases and requires a valid canvas', () => {
    const html = renderInlineSvg('<svg width="300" height="160"><rect width="100" height="60" strokeWidth="2" className="node" /></svg>', EXPAND_BUTTON);
    expect(html).toContain('viewBox="0 0 300 160"');
    expect(html).toContain('stroke-width="2"');
    expect(html).toContain('class="node"');
    for (const source of ['<svg><rect/></svg>', '<svg viewBox="0 0 -1 100"/>', '<svg viewBox="0 0 9000 100"/>', '<svg viewBox="0 0 NaN 100"/>', '<svg viewBox="0 0 300 160"><rect width={100}/></svg>']) expect(renderInlineSvg(source, EXPAND_BUTTON)).toContain('role="alert"');
  });

  it('rejects DTDs, malformed XML, duplicate IDs and oversized blocks visibly', () => {
    for (const source of [
      '<!DOCTYPE svg [<!ENTITY external SYSTEM "file:///etc/passwd">]><svg viewBox="0 0 300 100"><text>&external;</text></svg>',
      '<svg viewBox="0 0 300 100"><rect></svg>',
      '<svg viewBox="0 0 300 100"><g id="same"/><g id="same"/></svg>',
      `<svg viewBox="0 0 300 100"><text>${'x'.repeat(INLINE_SVG_LIMITS.bytes)}</text></svg>`,
      `<svg viewBox="0 0 300 100">${'<g>'.repeat(42)}${'</g>'.repeat(42)}</svg>`,
      `<svg viewBox="0 0 300 100">${'<rect/>'.repeat(INLINE_SVG_LIMITS.elements)}</svg>`,
    ]) expect(renderInlineSvg(source, EXPAND_BUTTON)).toContain('role="alert"');
    expect(renderMarkdownBody('<svg viewBox="0 0 300 100"><rect />', 'mdx')).toContain('Missing closing');
  });
});

describe('inline SVG security regressions', () => {
  it('validates and emits the same normalized href without leading-space scheme bypasses', () => {
    for (const href of [' javascript:alert(1)', ' https://evil.example/pixel.svg', ' //evil.example/pixel.svg', ' ../private.svg', '&#x20;javascript:alert(1)']) {
      const body = renderInlineSvg(`<svg viewBox="0 0 300 100"><a href="${href}"><text x="10" y="30">Link</text></a><image href="${href}" width="40" height="40"/></svg>`, EXPAND_BUTTON);
      const svg = svgElement(body);
      expect(svg.getElementsByTagName('a')[0].hasAttribute('href')).toBe(false);
      expect(svg.getElementsByTagName('image')[0].hasAttribute('href')).toBe(false);
    }
    const safe = svgElement(renderInlineSvg('<svg viewBox="0 0 300 100"><a href=" details.mdx "><text>Details</text></a><image href=" images/logo.svg " /></svg>', EXPAND_BUTTON));
    expect(safe.getElementsByTagName('a')[0].getAttribute('href')).toBe('details.mdx');
    expect(safe.getElementsByTagName('image')[0].getAttribute('href')).toBe('images/logo.svg');
  });

  it('captures entire SVG text and CDATA blocks before interpreting Markdown fences', () => {
    for (const fence of ['~~~', '```', '~~~~', '````']) {
      for (const cdata of [false, true]) {
        const label = `${fence}\nlabel\n${fence}`;
        const text = cdata ? `<![CDATA[${label}]]>` : label;
        const source = `<svg viewBox="0 0 300 100">\n<text x="10" y="30">\n${text}\n</text>\n<script>bad()</script>\n<rect width="10" height="10" onload="bad()" />\n</svg>\n\nAfter **the graphic**.`;
        const body = renderMarkdownBody(source, 'mdx');
        expect(body).toContain('mv-svg-inline');
        expect(body).not.toContain('<script');
        expect(body).not.toContain('onload=');
        expect(body).not.toContain('Missing closing');
        expect(body).toContain('After <strong>the graphic</strong>');
        expect(svgElement(body).textContent).toContain(fence);
      }
    }
  });

  it('rejects compound, recursive and amplifying use references but permits primitive reuse', () => {
    const definitions = ['<g id="n0"><rect width="1" height="1"/></g>', ...Array.from({ length: 20 }, (_, index) => `<g id="n${index + 1}"><use href="#n${index}"/><use href="#n${index}"/></g>`)].join('');
    expect(renderInlineSvg(`<svg viewBox="0 0 100 100"><defs>${definitions}</defs><use href="#n20"/></svg>`, EXPAND_BUTTON)).toContain('use may reference only local primitive shapes');
    expect(renderInlineSvg('<svg viewBox="0 0 100 100"><use id="loop" href="#loop"/></svg>', EXPAND_BUTTON)).toContain('role="alert"');
    const primitive = renderInlineSvg('<svg viewBox="0 0 300 100"><defs><path id="icon" d="M0 0 L20 0 L20 20 Z"/></defs><use href=" #icon " x="20"/></svg>', EXPAND_BUTTON);
    expect(primitive).not.toContain('role="alert"');
    expect(primitive).toMatch(/href="#mv-inline-\d+-icon"/);
  });
});
