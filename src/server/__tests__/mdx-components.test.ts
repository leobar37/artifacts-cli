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

  it('Video renders a native player for sibling and https sources', () => {
    const html = renderMdxComponent('Video', { src: 'clip.mp4', title: 'Demo' }, '');
    expect(html).toContain('<video');
    expect(html).toContain('src="clip.mp4"');
    expect(html).toContain('controls');
    expect(html).toContain('Demo');
    const ext = renderMdxComponent('Video', { src: 'https://cdn.example.com/demo.mp4' }, '');
    expect(ext).toContain('src="https://cdn.example.com/demo.mp4"');
    const poster = renderMdxComponent('Video', { src: 'clip.mp4', poster: 'thumb.png' }, '');
    expect(poster).toContain('poster="thumb.png"');
  });

  it('Video rejects unsafe sources', () => {
    expect(renderMdxComponent('Video', { src: 'javascript:alert(1)' }, '')).toBeNull();
    expect(renderMdxComponent('Video', { src: 'data:video/mp4;base64,xx' }, '')).toBeNull();
    expect(renderMdxComponent('Video', { src: '../up.mp4' }, '')).toBeNull();
    expect(renderMdxComponent('Video', { src: '/abs.mp4' }, '')).toBeNull();
    expect(renderMdxComponent('Video', { src: 'clip.mp4', poster: '../evil.png' }, '')).toBeNull();
    expect(renderMdxComponent('Video', {}, '')).toBeNull();
  });

  it('Audio renders a native player and rejects unsafe sources', () => {
    const html = renderMdxComponent('Audio', { src: 'nota.mp3', title: 'Resumen' }, '');
    expect(html).toContain('<audio');
    expect(html).toContain('src="nota.mp3"');
    expect(html).toContain('Resumen');
    expect(renderMdxComponent('Audio', { src: 'blob:https://x' }, '')).toBeNull();
    expect(renderMdxComponent('Audio', { src: '//cdn.example.com/a.mp3' }, '')).toBeNull();
    expect(renderMdxComponent('Audio', {}, '')).toBeNull();
  });

  it('autoplay always renders muted (browser policy)', () => {
    expect(renderMdxComponent('Video', { src: 'clip.mp4', autoplay: true }, '')).toContain('autoplay muted playsinline');
    expect(renderMdxComponent('Audio', { src: 'nota.mp3', autoplay: true }, '')).toContain('autoplay muted');
  });

  it('rejects attribute-breakout payloads in media and frame sources', () => {
    expect(renderMdxComponent('Video', { src: 'a" onerror="alert(1)' }, '')).toBeNull();
    expect(renderMdxComponent('Audio', { src: "a' onerror='alert(1)" }, '')).toBeNull();
    expect(renderMdxComponent('Video', { src: 'clip.mp4', poster: 'p" onerror="alert(1)' }, '')).toBeNull();
    expect(renderMdxComponent('Webframe', { src: 'x" onload="alert(1)' }, '')).toBeNull();
    expect(renderMdxComponent('Video', { src: 'http://cdn.example.com/a.mp4' }, '')).toBeNull();
  });

  it('escapes quotes in rendered captions and urls', () => {
    const html = renderMdxComponent('Video', { src: 'clip.mp4', title: 'a"b<c>' }, '');
    expect(html).toContain('a&quot;b&lt;c&gt;');
    expect(html).not.toContain('a"b<c>');
  });

  it('Stats wraps children; unknown tags return null', () => {
    expect(renderMdxComponent('Stats', {}, '<div class="mv-stat"></div>')).toContain('mv-stats');
    expect(renderMdxComponent('Nope', {}, '')).toBeNull();
  });

  it('Section renders a titled card whose heading is indexable', () => {
    const html = renderMdxComponent('Section', { title: 'Qué es' }, '<p>body</p>');
    expect(html).toContain('<section class="mv-section">');
    expect(html).toContain('<h2 id="que-es">Qué es</h2>');
    expect(html).toContain('<p>body</p>');
  });

  it('Section honors custom id/subtitle and rejects bad input', () => {
    const html = renderMdxComponent('Section', { title: 'Flujo', id: 'flujo-x', subtitle: 'De punta a punta' }, '');
    expect(html).toContain('id="flujo-x"');
    expect(html).toContain('De punta a punta');
    expect(renderMdxComponent('Section', {}, '')).toBeNull();
    expect(renderMdxComponent('Section', { title: 'x', id: '9-bad' }, '')).toBeNull();
  });

  it('Svg renders boxes, arrows and texts as inline svg', () => {
    const html = renderMdxComponent('Svg', {
      title: 'Flujo',
      shapes: [
        { type: 'box', x: 10, y: 30, w: 150, h: 70, label: 'Entrega' },
        { type: 'arrow', x1: 160, y1: 65, x2: 230, y2: 65, label: 'vende' },
        { type: 'box', x: 230, y: 30, w: 150, h: 70, label: 'Cobra', color: 'green' },
        { type: 'text', x: 195, y: 140, text: 'cierre diario' },
      ],
    }, '');
    expect(html).toContain('<svg viewBox="0 0 640 220"');
    expect(html).toContain('<rect');
    expect(html).toContain('Entrega');
    expect(html).toContain('<line');
    expect(html).toContain('cierre diario');
  });

  it('Svg rejects empty shapes and escapes labels', () => {
    expect(renderMdxComponent('Svg', { shapes: [] }, '')).toBeNull();
    expect(renderMdxComponent('Svg', {}, '')).toBeNull();
    const html = renderMdxComponent('Svg', {
      shapes: [{ type: 'box', x: 10, y: 10, w: 120, h: 60, label: '<script>' }],
    }, '');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('Chart and Svg carry an expand button for the overlay', () => {
    const chart = renderMdxComponent('Chart', { data: [{ name: 'Q1', v: 1 }] }, '');
    expect(chart).toContain('<figure class="mv-graph mv-chart">');
    expect(chart).toContain('class="mv-expand"');
    const svg = renderMdxComponent('Svg', { shapes: [{ type: 'box', x: 10, y: 10, w: 120, h: 60 }] }, '');
    expect(svg).toContain('<figure class="mv-graph mv-svg">');
    expect(svg).toContain('class="mv-expand"');
  });
});

describe('renderMdxComponent data views', () => {
  const TASKS = {
    version: 1,
    columns: [{ id: 'pending', label: 'Pending' }],
    groups: [{ id: 'g1', label: 'Phase 1' }],
    items: [
      { id: 'T-1', title: 'Ship <it>', status: 'pending', group: 'g1' },
      { id: 'T-2', title: 'Rest', status: 'pending' },
    ],
  };

  it('TaskList renders inline data server-side with escaping', () => {
    const html = renderMdxComponent('TaskList', { data: TASKS, title: 'Work items' }, '');
    expect(html).toContain('mv-tasklist');
    expect(html).toContain('mv-data-title">Work items');
    expect(html).toContain('mv-badge">pending');
    expect(html).toContain('Ship &lt;it&gt;');
    expect(html).not.toContain('<it>');
  });

  it('TaskList groups only with groupBy="group"', () => {
    expect(renderMdxComponent('TaskList', { data: TASKS, groupBy: 'group' }, '')).toContain(
      'mv-data-group-label">Phase 1',
    );
    expect(renderMdxComponent('TaskList', { data: TASKS }, '')).not.toContain('mv-data-group-label');
    expect(
      renderMdxComponent('TaskList', { data: TASKS, groupBy: 'status' }, ''),
    ).not.toContain('mv-data-group-label');
  });

  it('Kanban renders declared columns from inline data', () => {
    const html = renderMdxComponent('Kanban', { data: TASKS }, '');
    expect(html).toContain('mv-kanban-col');
    expect(html).toContain('mv-kanban-col-label">Pending');
  });

  it('Properties renders entries from inline data', () => {
    const html = renderMdxComponent(
      'Properties',
      { data: { version: 1, entries: [{ label: 'Worker', value: 'GLM' }] }, title: 'Profile' },
      '',
    );
    expect(html).toContain('mv-props');
    expect(html).toContain('<dt>Worker</dt><dd>GLM</dd>');
    expect(html).toContain('mv-data-title">Profile');
  });

  it('src emits a hydratable placeholder and never fetches', () => {
    const html = renderMdxComponent('TaskList', { src: 'tasks.json', title: 'Work items' }, '');
    expect(html).toContain('class="mv-data mv-data-src"');
    expect(html).toContain('data-kind="tasklist"');
    expect(html).toContain('data-src="tasks.json"');
    expect(html).toContain('data-title="Work items"');
    expect(html).toContain('<noscript>');
    expect(html).not.toContain('mv-tasklist"');
  });

  it('data + src together is a visible error, not a placeholder', () => {
    const html = renderMdxComponent('TaskList', { data: TASKS, src: 'tasks.json' }, '');
    expect(html).toContain('mv-data-error');
    expect(html).toContain('role="alert"');
    expect(html).toContain('not both');
    expect(html).not.toContain('mv-data-src');
  });

  it('neither data nor src is a visible error', () => {
    const html = renderMdxComponent('Kanban', { title: 'Board' }, '');
    expect(html).toContain('mv-data-error');
    expect(html).toContain('exactly one of');
  });

  it('unsafe or non-string src values are visible errors', () => {
    expect(renderMdxComponent('TaskList', { src: 'https://evil.com/x.json' }, '')).toContain(
      'mv-data-error',
    );
    expect(renderMdxComponent('TaskList', { src: '../up.json' }, '')).toContain('mv-data-error');
    expect(renderMdxComponent('TaskList', { src: '/abs.json' }, '')).toContain('mv-data-error');
    expect(renderMdxComponent('TaskList', { src: 5 }, '')).toContain('mv-data-error');
  });

  it('invalid datasets and titles render component-level errors', () => {
    expect(renderMdxComponent('Properties', { data: { version: 2, entries: [] } }, '')).toContain(
      'unsupported dataset version',
    );
    expect(
      renderMdxComponent('TaskList', { data: TASKS, title: 'x'.repeat(257) }, ''),
    ).toContain('mv-data-error');
  });

  it('legacy components are unchanged alongside the new cases', () => {
    expect(renderMdxComponent('Chart', { data: [{ name: 'Q1', v: 1 }] }, '')).toContain(
      'recharts-bar',
    );
    expect(renderMdxComponent('Callout', { type: 'info' }, '<p>x</p>')).toContain('mv-callout--info');
    expect(renderMdxComponent('Stat', { value: '1', label: 'L' }, '')).toContain('mv-stat');
    expect(renderMdxComponent('Nope', {}, '')).toBeNull();
  });
});
