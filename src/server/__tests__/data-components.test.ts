import { describe, it, expect } from 'vitest';
import {
  renderKanban,
  renderProperties,
  renderDataSrcPlaceholder,
  renderTaskList,
} from '../data-components.js';

const WORK_DATA = {
  version: 1,
  columns: [
    { id: 'pending', label: 'Pending' },
    { id: 'done', label: 'Done' },
    { id: 'blocked', label: 'Blocked' },
  ],
  groups: [{ id: 'phase-1', label: 'First phase' }],
  items: [
    { id: 'T-2', title: 'Second task', status: 'pending', group: 'phase-1' },
    { id: 'T-1', title: 'First task', status: 'done' },
    {
      id: 'T-3',
      title: 'Third task',
      status: 'pending',
      group: 'phase-1',
      owner: 'worker',
      description: 'Prepare fixtures',
      href: '#local-anchor',
    },
  ],
};

describe('renderTaskList', () => {
  it('preserves item order flat when groupBy is absent', () => {
    const html = renderTaskList(WORK_DATA);
    expect(html).toContain('mv-tasklist');
    const t2 = html.indexOf('Second task');
    const t1 = html.indexOf('First task');
    const t3 = html.indexOf('Third task');
    expect(t2).toBeGreaterThanOrEqual(0);
    expect(t2).toBeLessThan(t1);
    expect(t1).toBeLessThan(t3);
    expect(html).not.toContain('mv-data-group-label');
  });

  it('shows textual status badge, owner, description and safe link', () => {
    const html = renderTaskList(WORK_DATA, { groupBy: 'flat' });
    expect(html).toContain('mv-badge">pending');
    expect(html).toContain('mv-task-owner">worker');
    expect(html).toContain('mv-task-desc">Prepare fixtures');
    expect(html).toContain('<a class="mv-task-title" href="#local-anchor">Third task</a>');
  });

  it('groups by group id in declared order with Ungrouped last', () => {
    const html = renderTaskList(WORK_DATA, { groupBy: 'group' });
    const phase = html.indexOf('First phase');
    const ungrouped = html.indexOf('Ungrouped');
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(ungrouped).toBeGreaterThan(phase);
    // Second task lives in the phase group; First task in Ungrouped.
    expect(html.indexOf('Second task')).toBeGreaterThan(phase);
    expect(html.indexOf('Second task')).toBeLessThan(ungrouped);
    expect(html.indexOf('First task')).toBeGreaterThan(ungrouped);
  });

  it('renders an empty state when items is empty', () => {
    const html = renderTaskList({ version: 1, columns: [], items: [] });
    expect(html).toContain('mv-data-empty');
    expect(html).not.toContain('mv-task"');
  });

  it('escapes hostile titles, statuses and attributes', () => {
    const html = renderTaskList({
      version: 1,
      columns: [{ id: 'on"x', label: 'X' }],
      items: [
        {
          id: 'H-1',
          title: '<script>alert(1)</script>',
          status: 'on"x',
          owner: '"><img src=x onerror=alert(2)>',
          description: 'de"sc <b>',
        },
      ],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('mv-badge">on&quot;x');
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(2)&gt;');
    expect(html).toContain('de&quot;sc &lt;b&gt;');
  });

  it('renders safe relative links and rejects unsafe hrefs with an error', () => {
    const ok = renderTaskList({
      version: 1,
      columns: [{ id: 'x', label: 'X' }],
      items: [{ id: 'A', title: 'Linked', status: 'x', href: 'docs/next.md' }],
    });
    expect(ok).toContain('href="docs/next.md"');
    const bad = renderTaskList({
      version: 1,
      columns: [{ id: 'x', label: 'X' }],
      items: [{ id: 'A', title: 'Evil', status: 'x', href: 'javascript:alert(1)' }],
    });
    expect(bad).toContain('mv-data-error');
    expect(bad).not.toContain('<a ');
    expect(bad).not.toContain('javascript:');
  });

  it('escapes the optional title and treats invalid titles as an error state', () => {
    expect(renderTaskList(WORK_DATA, { title: 'Work & <items>' })).toContain(
      'mv-data-title">Work &amp; &lt;items&gt;',
    );
    const overlong = renderTaskList(WORK_DATA, { title: 'x'.repeat(257) });
    expect(overlong).toContain('mv-data-error');
    expect(renderTaskList(WORK_DATA, { title: 42 })).toContain('mv-data-error');
  });

  it('surfaces malformed datasets as visible errors, never throws', () => {
    expect(renderTaskList({ version: 2, columns: [], items: [] })).toContain(
      'unsupported dataset version',
    );
    expect(
      renderTaskList({
        version: 1,
        columns: [{ id: 'x', label: 'X' }],
        items: [
          { id: 'A', title: 'One', status: 'x' },
          { id: 'A', title: 'Two', status: 'x' },
        ],
      }),
    ).toContain('duplicate item id');
    expect(renderTaskList(null)).toContain('mv-data-error');
    expect(renderTaskList([WORK_DATA])).toContain('mv-data-error');
    const tooMany = renderTaskList({
      version: 1,
      columns: [{ id: 'x', label: 'X' }],
      items: Array.from({ length: 1001 }, (_, i) => ({ id: `I${i}`, title: 't', status: 'x' })),
    });
    expect(tooMany).toContain('too many items');
  });
});

describe('renderKanban', () => {
  it('renders columns in declared order with items filtered by status', () => {
    const html = renderKanban(WORK_DATA, { title: 'Board' });
    expect(html).toContain('mv-kanban');
    expect(html).toContain('mv-data-title">Board');
    const pending = html.indexOf('Pending');
    const done = html.indexOf('Done');
    const blocked = html.indexOf('Blocked');
    expect(pending).toBeLessThan(done);
    expect(done).toBeLessThan(blocked);
    expect(html).toContain('mv-kanban-count">2');
    expect(html).toContain('mv-kanban-count">1');
    expect(html).toContain('mv-kanban-count">0');
  });

  it('shows a per-column empty note and a board empty state with zero columns', () => {
    const html = renderKanban(WORK_DATA);
    expect(html).toContain('mv-kanban-empty');
    const empty = renderKanban({ version: 1, columns: [], items: [] });
    expect(empty).toContain('mv-data-empty');
    expect(empty).not.toContain('mv-kanban-col"');
  });

  it('escapes hostile column labels and rejects bad datasets', () => {
    const html = renderKanban({
      version: 1,
      columns: [{ id: 'x', label: '<b>bold</b>' }],
      items: [],
    });
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(renderKanban({ version: 1, items: [] })).toContain('mv-data-error');
    expect(renderKanban('nope')).toContain('mv-data-error');
  });
});

describe('renderProperties', () => {
  const PROPS = {
    version: 1,
    entries: [
      { label: 'Coordinator', value: 'Muse Spark 1.3', group: 'Models' },
      { label: 'Worker', value: 'GLM 5.3 Flash', group: 'Models' },
      { label: 'Parallel workers', value: 1 },
      { label: 'Enabled', value: true },
      { label: 'Token', value: null },
    ],
  };

  it('renders scalar values stringified in entry order', () => {
    const html = renderProperties(PROPS);
    expect(html).toContain('mv-props');
    expect(html).toContain('<dt>Parallel workers</dt><dd>1</dd>');
    expect(html).toContain('<dt>Enabled</dt><dd>true</dd>');
    expect(html).toContain('<dt>Token</dt><dd>null</dd>');
    const worker = html.indexOf('Worker');
    const parallel = html.indexOf('Parallel workers');
    expect(worker).toBeLessThan(parallel);
  });

  it('groups sections by first appearance with Ungrouped last', () => {
    const html = renderProperties(PROPS);
    const models = html.indexOf('Models');
    const ungrouped = html.indexOf('Ungrouped');
    expect(models).toBeGreaterThanOrEqual(0);
    expect(ungrouped).toBeGreaterThan(models);
    expect(html.indexOf('Coordinator')).toBeGreaterThan(models);
  });

  it('renders flat without section headers when no entry has a group', () => {
    const html = renderProperties({
      version: 1,
      entries: [
        { label: 'a', value: 1 },
        { label: 'b', value: 'x' },
      ],
    });
    expect(html).toContain('mv-props');
    expect(html).not.toContain('mv-data-group-label');
  });

  it('renders an empty state and escapes hostile labels/values', () => {
    expect(renderProperties({ version: 1, entries: [] })).toContain('mv-data-empty');
    const html = renderProperties({
      version: 1,
      entries: [{ label: '<script>', value: '"quoted" & <weird>' }],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;quoted&quot; &amp; &lt;weird&gt;');
  });

  it('rejects malformed datasets with visible errors', () => {
    expect(renderProperties({ version: 1 })).toContain('mv-data-error');
    expect(
      renderProperties({ version: 1, entries: [{ label: 'x', value: { nested: true } }] }),
    ).toContain('must be a string, finite number, boolean, or null');
    expect(renderProperties(undefined)).toContain('mv-data-error');
  });
});

describe('renderDataSrcPlaceholder', () => {
  it('emits a declarative hydratable element with loading text and noscript fallback', () => {
    const html = renderDataSrcPlaceholder('tasklist', 'tasks.json', 'Work items');
    expect(html).toContain('class="mv-data mv-data-src"');
    expect(html).toContain('data-kind="tasklist"');
    expect(html).toContain('data-src="tasks.json"');
    expect(html).toContain('data-title="Work items"');
    expect(html).toContain('role="status"');
    expect(html).toContain('<noscript>');
    expect(html).not.toContain('fetch(');
  });

  it('escapes hostile src and title values', () => {
    const html = renderDataSrcPlaceholder('kanban', 'a"b.json', 't"itle');
    expect(html).toContain('data-src="a&quot;b.json"');
    expect(html).toContain('data-title="t&quot;itle"');
    expect(html).not.toContain('"b.json"');
  });

  it('renders an error for unsafe src values', () => {
    for (const bad of ['https://evil.com/x.json', '../up.json', '/abs.json', 'x.json?q=1', 'x.json#f']) {
      const html = renderDataSrcPlaceholder('properties', bad);
      expect(html).toContain('mv-data-error');
      expect(html).not.toContain(`data-src="${bad}`);
    }
  });
});
