import { describe, it, expect } from 'vitest';
import { findJsxBlock, parseJsxProps, renderMdxComponent } from '../mdx-components.js';

describe('findJsxBlock', () => {
  it('finds a self-closing block with multiline braces and quoted strings', () => {
    const src = [
      'intro text',
      '<Chart',
      '  type="bar"',
      '  data={[{ name: "Q1", v: 12 }, { name: "Q>1", v: 3 }]}',
      '  height={240}',
      '/>',
      'after',
    ].join('\n');
    const block = findJsxBlock(src);
    expect(block?.tag).toBe('Chart');
    expect(block?.selfClosing).toBe(true);
    expect(block?.start).toBe(src.indexOf('<Chart'));
    expect(block?.end).toBe(src.indexOf('/>') + 2);
    // The `>` inside a quoted string must not terminate the attrs scan.
    expect(parseJsxProps(block!.attrs)).toMatchObject({ type: 'bar', height: 240 });
  });

  it('captures children up to the matching close tag, nesting the same tag', () => {
    const src = '<Callout type="info">\n  inner <Callout /> stays\n</Callout>';
    const block = findJsxBlock(src);
    expect(block?.selfClosing).toBe(false);
    expect(block?.children).toContain('inner <Callout /> stays');
    expect(block?.end).toBe(src.length);
  });

  it('ignores lowercase html and indented-after-text components', () => {
    expect(findJsxBlock('<details>\n<summary>x</summary>\n</details>')).toBeNull();
    expect(findJsxBlock('para <Chart /> inline')).toBeNull();
  });
});

describe('parseJsxProps', () => {
  it('parses strings, numbers, booleans and relaxed json', () => {
    const props = parseJsxProps(
      `title="Rev (k)" height={240} legend={true} data={[{ name: 'Q1', v: 12, },]}`,
    );
    expect(props).toEqual({
      title: 'Rev (k)',
      height: 240,
      legend: true,
      data: [{ name: 'Q1', v: 12 }],
    });
  });

  it('parses primitives inside braces directly (numbers, booleans)', () => {
    expect(parseJsxProps('height={260}')).toEqual({ height: 260 });
    expect(parseJsxProps('x={42.5}')).toEqual({ x: 42.5 });
  });

  it('returns null on unterminated blocks', () => {
    expect(findJsxBlock('<Chart data={[1, 2')).toBeNull(); // unbalanced brace, no `>`
    expect(findJsxBlock('<Callout>never closed')).toBeNull();
  });
  it('rejects boolean shorthand props', () => {
    expect(parseJsxProps('disabled')).toBeNull();
  });
});

describe('renderMdxComponent', () => {
  const DATA = [
    { name: 'Q1', mrr: 12, churn: 2 },
    { name: 'Q2', mrr: 14, churn: 1 },
  ];

  it('renders a bar chart as inline svg with themed strokes', () => {
    const html = renderMdxComponent('Chart', { data: DATA, series: ['mrr', 'churn'] }, '');
    expect(html).toContain('<svg');
    expect(html).toContain('recharts-bar');
    expect(html).toContain('var(--border)');
  });

  it('renders line, area and pie variants', () => {
    expect(renderMdxComponent('Chart', { type: 'line', data: DATA }, '')).toContain('recharts-line');
    expect(renderMdxComponent('Chart', { type: 'area', data: DATA }, '')).toContain('recharts-area');
    const pie = renderMdxComponent('Chart', { type: 'pie', data: DATA }, '');
    expect(pie).toContain('recharts-pie');
    expect(pie).toContain('recharts-sector');
  });

  it('custom x key and title', () => {
    const html = renderMdxComponent(
      'Chart',
      { data: [{ week: 'W1', s: 3 }], x: 'week', title: 'Sessions' },
      '',
    );
    expect(html).toContain('mv-chart-title">Sessions');
    // recharts keeps dataKey in JS; the category ticks prove the x mapping.
    expect(html).toContain('W1</tspan>');
  });


  it('returns null for invalid chart data', () => {
    expect(renderMdxComponent('Chart', { data: [] }, '')).toBeNull();
    expect(renderMdxComponent('Chart', { data: 'nope' }, '')).toBeNull();
    expect(renderMdxComponent('Chart', { data: [{ name: 'x' }] }, '')).toBeNull(); // no numeric series
  });

  it('renders callouts with kind, title and markdown children', () => {
    const html = renderMdxComponent('Callout', { type: 'warning', title: 'Careful' }, '<p><strong>bold</strong></p>');
    expect(html).toContain('mv-callout--warning');
    expect(html).toContain('mv-callout-title">Careful');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('defaults callout kind to info for unknown types', () => {
    expect(renderMdxComponent('Callout', { type: 'purple' }, 'x')).toContain('mv-callout--info');
  });

  it('renders stats with delta direction', () => {
    const up = renderMdxComponent('Stat', { value: '14.9k', label: 'MRR', delta: '+24%' }, '');
    expect(up).toContain('mv-stat-value">14.9k');
    expect(up).toContain('mv-stat-delta--up');
    const down = renderMdxComponent('Stat', { value: '1.4%', delta: '-0.5pp' }, '');
    expect(down).toContain('mv-stat-delta--down');
    expect(renderMdxComponent('Stat', { label: 'no value' }, '')).toBeNull();
  });

  it('Webframe renders a sandboxed iframe with browser chrome', () => {
    const html = renderMdxComponent('Webframe', { src: 'wireframe.html', height: 420 }, '');
    expect(html).toContain('mv-frame-bar');
    expect(html).toContain('src="wireframe.html"');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-popups"');
    expect(html).toContain('height:420px');
  });

  it('Webframe rejects non-relative sources', () => {
    expect(renderMdxComponent('Webframe', { src: 'https://evil.com' }, '')).toBeNull();
    expect(renderMdxComponent('Webframe', { src: '//evil.com' }, '')).toBeNull();
    expect(renderMdxComponent('Webframe', { src: '/abs.html' }, '')).toBeNull();
    expect(renderMdxComponent('Webframe', { src: '../up.html' }, '')).toBeNull();
    expect(renderMdxComponent('Webframe', {}, '')).toBeNull();
  });

  it('Stats wraps children; unknown tags return null', () => {
    expect(renderMdxComponent('Stats', {}, '<div class="mv-stat"></div>')).toContain('mv-stats');
    expect(renderMdxComponent('Nope', {}, '')).toBeNull();
  });
});
