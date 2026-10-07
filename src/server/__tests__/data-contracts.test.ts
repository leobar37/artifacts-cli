import { describe, it, expect } from 'vitest';
import {
  LIMITS,
  byteLengthExceeded,
  isSafeHref,
  isSafeSrc,
  validateProperties,
  validateSrc,
  validateWorkItems,
  type PropertiesDataset,
  type ValidationOk,
  type WorkItemsDataset,
} from '../data-contracts.js';

const MIB = 1024 * 1024;

function workItemsFixture(): Record<string, unknown> {
  return {
    version: 1,
    generatedAt: '2026-10-06T00:00:00Z',
    sourceLabel: 'Illustrative snapshot',
    columns: [
      { id: 'pending', label: 'Pending' },
      { id: 'done', label: 'Done' },
    ],
    groups: [{ id: 'phase-1', label: 'First phase' }],
    items: [
      {
        id: 'T-1',
        title: 'Prepare fixtures',
        status: 'pending',
        group: 'phase-1',
        owner: 'worker',
        description: 'Sets up the shared fixtures directory',
        href: 'phases/fixtures.md',
      },
      { id: 'T-2', title: 'Ship it', status: 'done' },
    ],
  };
}

function propertiesFixture(): Record<string, unknown> {
  return {
    version: 1,
    entries: [
      { label: 'Coordinator', value: 'Muse Spark 1.3', group: 'Models' },
      { label: 'Worker', value: 'GLM 5.3 Flash', group: 'Models' },
      { label: 'Parallel workers', value: 1 },
      { label: 'Watch mode', value: true },
      { label: 'Last error', value: null },
    ],
  };
}

describe('validateWorkItems', () => {
  it('accepts a full dataset with metadata, groups, owner, description and href', () => {
    const result = validateWorkItems(workItemsFixture());
    expect(result.ok).toBe(true);
    const data = (result as ValidationOk<WorkItemsDataset>).data;
    expect(data.version).toBe(1);
    expect(data.columns.map((c) => c.id)).toEqual(['pending', 'done']);
    expect(data.groups?.[0]).toEqual({ id: 'phase-1', label: 'First phase' });
    expect(data.items[0]).toMatchObject({
      id: 'T-1',
      title: 'Prepare fixtures',
      status: 'pending',
      group: 'phase-1',
      owner: 'worker',
      href: 'phases/fixtures.md',
    });
  });

  it('accepts a zero-column empty dataset and omits absent groups', () => {
    const result = validateWorkItems({ version: 1, columns: [], items: [] });
    expect(result.ok).toBe(true);
    const data = (result as ValidationOk<WorkItemsDataset>).data;
    expect(data.columns).toEqual([]);
    expect(data.items).toEqual([]);
    expect('groups' in data).toBe(false);
  });

  it('treats a missing optional group as Ungrouped instead of rejecting', () => {
    const result = validateWorkItems({
      version: 1,
      columns: [{ id: 'todo', label: 'To do' }],
      items: [{ id: 'T-1', title: 'Task', status: 'todo' }],
    });
    expect(result.ok).toBe(true);
    expect((result as ValidationOk<WorkItemsDataset>).data.items[0].group).toBeUndefined();
  });

  it('accepts free-form status labels as long as a matching column is declared', () => {
    const result = validateWorkItems({
      version: 1,
      columns: [{ id: 'in review ✅', label: 'In review' }],
      items: [{ id: 'T-1', title: 'Task', status: 'in review ✅' }],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects any version other than 1', () => {
    for (const version of [2, 0, '1', null, undefined]) {
      const result = validateWorkItems({ ...workItemsFixture(), version });
      expect(result.ok, `version ${JSON.stringify(version)}`).toBe(false);
      if (!result.ok) expect(result.errors.join(' ')).toContain('unsupported dataset version');
    }
  });

  it('rejects duplicate item ids', () => {
    const data = workItemsFixture();
    (data.items as Record<string, unknown>[]).push({
      id: 'T-1',
      title: 'Duplicate',
      status: 'done',
    });
    const result = validateWorkItems(data);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('duplicate item id: T-1');
  });

  it('rejects items referencing unknown columns or groups', () => {
    const danglingColumn = validateWorkItems({
      version: 1,
      columns: [{ id: 'pending', label: 'Pending' }],
      items: [{ id: 'T-1', title: 'Task', status: 'nope' }],
    });
    expect(danglingColumn.ok).toBe(false);
    if (!danglingColumn.ok) expect(danglingColumn.errors.join(' ')).toContain('unknown column');

    const danglingGroup = validateWorkItems({
      ...workItemsFixture(),
      items: [{ id: 'T-9', title: 'Task', status: 'pending', group: 'ghost' }],
    });
    expect(danglingGroup.ok).toBe(false);
    if (!danglingGroup.ok) expect(danglingGroup.errors.join(' ')).toContain('unknown group');

    const noGroupsDeclared = validateWorkItems({
      version: 1,
      columns: [{ id: 'pending', label: 'Pending' }],
      items: [{ id: 'T-1', title: 'Task', status: 'pending', group: 'phase-1' }],
    });
    expect(noGroupsDeclared.ok).toBe(false);
    if (!noGroupsDeclared.ok) expect(noGroupsDeclared.errors.join(' ')).toContain('unknown group');
  });

  it('requires declared columns once items are present', () => {
    const result = validateWorkItems({
      version: 1,
      columns: [],
      items: [{ id: 'T-1', title: 'Task', status: 'pending' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('non-empty items require');
  });

  it('rejects malformed structural shapes without throwing', () => {
    for (const data of [null, undefined, 42, 'x', [], true]) {
      const result = validateWorkItems(data);
      expect(result.ok, String(data)).toBe(false);
    }
    const noColumns = validateWorkItems({ version: 1, items: [] });
    const noItems = validateWorkItems({ version: 1, columns: [] });
    expect(noColumns.ok).toBe(false);
    expect(noItems.ok).toBe(false);
  });

  it('rejects item fields of the wrong type instead of throwing', () => {
    const result = validateWorkItems({
      version: 1,
      columns: [{ id: 'pending', label: 'Pending' }],
      items: [
        { id: 'T-1', title: 'Task', status: 'pending', href: 42 },
        { id: 7, title: 'Task', status: 'pending' },
        { id: 'T-3', title: '', status: 'pending' },
        { id: 'T-4', title: 'Task', status: '' },
        'not-an-object',
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveLength(5);
  });
});

describe('validateProperties', () => {
  it('accepts a full dataset with every scalar value type and grouping', () => {
    const result = validateProperties(propertiesFixture());
    expect(result.ok).toBe(true);
    const data = (result as ValidationOk<PropertiesDataset>).data;
    expect(data.entries).toHaveLength(5);
    expect(data.entries[0]).toEqual({ label: 'Coordinator', value: 'Muse Spark 1.3', group: 'Models' });
    expect(data.entries[3].value).toBe(true);
    expect(data.entries[4].value).toBeNull();
  });

  it('accepts an empty entries list', () => {
    const result = validateProperties({ version: 1, entries: [] });
    expect(result.ok).toBe(true);
    expect((result as ValidationOk<PropertiesDataset>).data.entries).toEqual([]);
  });

  it('rejects nested objects, arrays and missing values', () => {
    for (const value of [{ a: 1 }, [1, 2], [{ nested: true }], undefined]) {
      const result = validateProperties({
        version: 1,
        entries: [{ label: 'Bad', value }],
      });
      expect(result.ok, JSON.stringify(value) ?? 'missing').toBe(false);
    }
  });

  it('rejects NaN and Infinity values', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = validateProperties({ version: 1, entries: [{ label: 'Bad', value }] });
      expect(result.ok, String(value)).toBe(false);
      if (!result.ok) expect(result.errors.join(' ')).toContain('finite');
    }
  });

  it('rejects executable-template shapes (functions and constructed objects)', () => {
    const fnResult = validateProperties({
      version: 1,
      entries: [{ label: 'Bad', value: () => 'boom' }],
    });
    expect(fnResult.ok).toBe(false);

    const ctorResult = validateProperties({
      version: 1,
      entries: [{ label: 'Bad', value: new Date(0) }],
    });
    expect(ctorResult.ok).toBe(false);
  });

  it('rejects invalid versions, non-object datasets and malformed entries', () => {
    expect(validateProperties({ ...propertiesFixture(), version: 2 }).ok).toBe(false);
    expect(validateProperties({ ...propertiesFixture(), version: '1' }).ok).toBe(false);
    for (const data of [null, 42, 'x', []]) {
      expect(validateProperties(data).ok).toBe(false);
    }
    expect(validateProperties({ version: 1, entries: 'nope' }).ok).toBe(false);
    expect(validateProperties({ version: 1, entries: ['nope'] }).ok).toBe(false);
    expect(validateProperties({ version: 1, entries: [{ label: '', value: 1 }] }).ok).toBe(false);
  });
});

describe('src boundary (isSafeSrc / validateSrc)', () => {
  it('accepts document-relative .json paths', () => {
    for (const src of ['tasks.json', './data/profile.json', 'sub/dir.json', './tasks.json', 'a/b/c/deep.json']) {
      expect(isSafeSrc(src), src).toBe(true);
      expect(validateSrc(src).ok, src).toBe(true);
    }
  });

  it('rejects hostile src paths', () => {
    const hostile: string[] = [
      '',
      '/tasks.json',
      '/abs/dir/data.json',
      '//evil.com/x.json',
      'https://evil.com/x.json',
      'http://evil/x.json',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/plain,x.json',
      '%6a%61vascript%3ax.json',
      'data\\tasks.json',
      'C:\\data\\tasks.json',
      '../tasks.json',
      'a/../../tasks.json',
      '..%2ftasks.json',
      '%2e%2e/tasks.json',
      '%252e%252e/tasks.json',
      '%2e%2e%2ftasks.json',
      '%5c..%5ctasks.json',
      'x.json#frag',
      'x.json?page=1',
      'x%3fpage=1.json',
      'tasks.md',
      'tasks.JSON',
      'data/profile',
      'x%.json',
      'x%2.json',
      'x\n.json',
      'x%0a.json',
      'x.json%',
    ];
    for (const src of hostile) {
      expect(isSafeSrc(src), JSON.stringify(src)).toBe(false);
      const result = validateSrc(src);
      expect(result.ok, JSON.stringify(src)).toBe(false);
      if (!result.ok) expect(result.errors).toHaveLength(1);
    }
  });

  it('gives readable errors for non-string and unsafe src values', () => {
    for (const src of [undefined, null, 42, {}, ['a.json']]) {
      const result = validateSrc(src);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.join(' ')).toContain('src');
    }
    const traversal = validateSrc('../secrets.json');
    expect(traversal.ok).toBe(false);
    if (!traversal.ok) expect(traversal.errors[0]).toContain('traversal');
  });
});

describe('href boundary (isSafeHref)', () => {
  it('accepts in-document fragments and document-relative sibling paths', () => {
    for (const href of [
      '#section',
      '#',
      'phases/fixtures.md',
      './notes.md',
      'sub/dir/page.html',
      'img/shot.png',
      'data.json',
      'doc.md#section',
      'a%20b.md',
    ]) {
      expect(isSafeHref(href), href).toBe(true);
    }
  });

  it('rejects hostile hrefs', () => {
    const hostile: string[] = [
      '',
      'javascript:alert(1)',
      'javascript:void(0)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'file:///etc/hostname',
      'http://evil.example/x.md',
      'https://ok.example/x.md',
      '\\\\evil\\share',
      '..\\x.md',
      '../x.md',
      'a/../../x.md',
      '%2e%2e/x.md',
      '%252e%252e/x.md',
      'x.md?query=1',
      'doc.md#frag?x',
      '/abs.md',
      '//evil/x.md',
      'x%0A.md',
      'x%.md',
      '..%23anchor.md',
      '%2f%2fevil%2fx.md',
    ];
    for (const href of hostile) {
      expect(isSafeHref(href), JSON.stringify(href)).toBe(false);
    }
  });
});

describe('limits (NFR-002)', () => {
  it('rejects more than 1000 items without throwing', () => {
    const columns = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, label: `C${i}` }));
    const items = Array.from({ length: LIMITS.maxItems + 1 }, (_, i) => ({
      id: `T-${i}`,
      title: `Task ${i}`,
      status: 'c0',
    }));
    const over = validateWorkItems({ version: 1, columns, items });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.errors.join(' ')).toContain('max 1000');

    const exact = validateWorkItems({ version: 1, columns, items: items.slice(0, LIMITS.maxItems) });
    expect(exact.ok).toBe(true);
  });

  it('rejects more than 50 columns', () => {
    const columns = Array.from({ length: LIMITS.maxColumns + 1 }, (_, i) => ({ id: `c${i}`, label: `C${i}` }));
    const over = validateWorkItems({ version: 1, columns, items: [] });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.errors.join(' ')).toContain('max 50');

    const exact = validateWorkItems({
      version: 1,
      columns: columns.slice(0, LIMITS.maxColumns),
      items: [],
    });
    expect(exact.ok).toBe(true);
  });

  it('rejects more than 100 groups', () => {
    const groups = Array.from({ length: LIMITS.maxGroups + 1 }, (_, i) => ({ id: `g${i}`, label: `G${i}` }));
    const over = validateWorkItems({ ...workItemsFixture(), groups });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.errors.join(' ')).toContain('max 100');

    const exact = validateWorkItems({
      version: 1,
      columns: [{ id: 'pending', label: 'Pending' }],
      groups: groups.slice(0, LIMITS.maxGroups),
      items: [{ id: 'T-1', title: 'Task', status: 'pending', group: 'g99' }],
    });
    expect(exact.ok).toBe(true);
  });

  it('rejects more than 100 property entries', () => {
    const entries = Array.from({ length: LIMITS.maxEntries + 1 }, (_, i) => ({ label: `L${i}`, value: i }));
    const over = validateProperties({ version: 1, entries });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.errors.join(' ')).toContain('max 100');

    const exact = validateProperties({ version: 1, entries: entries.slice(0, LIMITS.maxEntries) });
    expect(exact.ok).toBe(true);
  });

  it('rejects overlong ids, titles, labels and values at the exact caps', () => {
    const long = (n: number) => 'x'.repeat(n);
    const cases: [string, unknown][] = [
      [`${LIMITS.maxIdLabel + 1}-char item id`, {
        version: 1,
        columns: [{ id: long(257), label: 'C' }],
        items: [],
      }],
      [`${LIMITS.maxIdLabel + 1}-char item title`, {
        version: 1,
        columns: [{ id: 'c', label: 'C' }],
        items: [{ id: 'T-1', title: long(257), status: 'c' }],
      }],
      [`${LIMITS.maxIdLabel + 1}-char column label`, {
        version: 1,
        columns: [{ id: 'c', label: long(257) }],
        items: [],
      }],
      [`${LIMITS.maxIdLabel + 1}-char group label`, {
        version: 1,
        columns: [{ id: 'c', label: 'C' }],
        groups: [{ id: 'g', label: long(257) }],
        items: [],
      }],
      [`${LIMITS.maxText + 1}-char description`, {
        version: 1,
        columns: [{ id: 'c', label: 'C' }],
        items: [{ id: 'T-1', title: 'T', status: 'c', description: long(4097) }],
      }],
      [`${LIMITS.maxIdLabel + 1}-char property label`, {
        version: 1,
        entries: [{ label: long(257), value: 'v' }],
      }],
      [`${LIMITS.maxText + 1}-char property value`, {
        version: 1,
        entries: [{ label: 'L', value: long(4097) }],
      }],
    ];
    for (const [name, data] of cases) {
      const result = Array.isArray((data as Record<string, unknown>).entries)
        ? validateProperties(data)
        : validateWorkItems(data);
      expect(result.ok, name).toBe(false);
    }

    // Exact caps still pass.
    expect(
      validateWorkItems({
        version: 1,
        columns: [{ id: long(256), label: long(256) }],
        items: [{ id: long(256), title: long(256), status: long(256), description: long(4096) }],
      }).ok,
    ).toBe(true);
    expect(validateProperties({ version: 1, entries: [{ label: long(256), value: long(4096) }] }).ok).toBe(true);
  });

  it('guards UTF-8 JSON bytes per source at 1 MiB', () => {
    expect(byteLengthExceeded('x'.repeat(MIB), MIB)).toBe(false);
    expect(byteLengthExceeded('x'.repeat(MIB + 1), MIB)).toBe(true);
    // 600k two-byte chars → 1.2 MB UTF-8.
    expect(byteLengthExceeded('é'.repeat(600_000), MIB)).toBe(true);
    expect(byteLengthExceeded('é'.repeat(400_000), MIB)).toBe(false);
    expect(byteLengthExceeded('x'.repeat(MIB + 1))).toBe(true);
    expect(byteLengthExceeded('', MIB)).toBe(false);
  });
});
