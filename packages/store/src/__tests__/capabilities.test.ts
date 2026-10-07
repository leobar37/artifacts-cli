import { describe, it, expect } from 'vitest';
import { formatCapabilitiesText, getViewerCapabilities } from '../capabilities.js';

describe('getViewerCapabilities', () => {
  it('documents the three formats with their entry files', () => {
    const caps = getViewerCapabilities();
    expect(caps.formats.map((f) => f.format)).toEqual(['html', 'md', 'mdx']);
    expect(caps.formats.map((f) => f.entryFile)).toEqual(['index.html', 'index.md', 'index.mdx']);
  });

  it('documents every renderer registered in mdx-components', () => {
    const documented = new Set(getViewerCapabilities().components.map((c) => c.name));
    // Keep in sync with renderMdxComponent's switch.
    expect(documented).toEqual(new Set(['Chart', 'Stats', 'Stat', 'Callout', 'Webframe', 'Video', 'Audio', 'Section', 'Svg', 'TaskList', 'Kanban', 'Properties']));
  });

  it('documents the JSON-backed data views with an exclusive data|src choice', () => {
    const comps = Object.fromEntries(getViewerCapabilities().components.map((c) => [c.name, c]));
    for (const name of ['TaskList', 'Kanban', 'Properties']) {
      const comp = comps[name]!;
      const propNames = comp.props.map((p) => p.name);
      expect(propNames).toContain('data');
      expect(propNames).toContain('src');
      expect(propNames).toContain('title');
      expect(comp.description.toLowerCase()).toContain('read-only');
      expect(comp.description.toLowerCase()).toContain('snapshot');
      expect(comp.example).toMatch(/src="[\w./-]+\.json"/);
    }
    expect(comps.TaskList!.props.some((p) => p.name === 'groupBy' && p.description.includes('"group"'))).toBe(true);
    expect(comps.TaskList!.description).toContain('item order');
    expect(comps.Kanban!.description).toContain('declared order');
    expect(comps.Properties!.description).toMatch(/scalar/);
  });

  it('mermaid is documented with fence usage', () => {
    const caps = getViewerCapabilities();
    expect(caps.mermaid.supported).toBe(true);
    expect(caps.mermaid.usage).toContain('mermaid');
    expect(caps.guidePath).toBe('/mdx-guide');
  });

  it('ships the relevance-filter guidance agents must apply', () => {
    const guidance = getViewerCapabilities().usageGuidance.join(' ').toLowerCase();
    expect(guidance).toContain('default to prose');
    expect(guidance).toContain('never invent');
    expect(guidance).toContain('one per document');
  });

  it('teaches the data-view data flow, limits and failure semantics in features', () => {
    const features = getViewerCapabilities().features.join('\n').toLowerCase();
    expect(features).toContain('tasklist/kanban/properties');
    expect(features).toContain('data={...}');
    expect(features).toContain('src="tasks.json"');
    expect(features).toContain('same-origin');
    expect(features).toContain('1 mib');
    expect(features).toContain('1,000 items');
    expect(features).toContain('50 columns');
    expect(features).toContain('100 groups');
    expect(features).toContain('100 property entries');
    expect(features).toContain('fails visibly');
    expect(features).toContain('role="alert"');
    expect(features).toContain('snapshots');
    expect(features).toContain('generatedat/sourcelabel');
    expect(features).toContain('document-relative');
    expect(features).toContain('read-only');
    expect(features).toContain('no drag-and-drop');
  });

  it('warns producers to curate safe fields and never imply live data', () => {
    const guidance = getViewerCapabilities().usageGuidance.join(' ').toLowerCase();
    expect(guidance).toContain('explicitly select safe fields');
    expect(guidance).toContain('credentials');
    expect(guidance).toContain('nothing is auto-redacted');
    expect(guidance).toContain('never imply a data view is connected');
    expect(guidance).toContain('display-only metadata');
  });
});

describe('formatCapabilitiesText', () => {
  it('renders a human table mentioning formats, components and the guide', () => {
    const text = formatCapabilitiesText(getViewerCapabilities(), 'http://localhost:7000/mdx-guide');
    expect(text).toContain('Formats');
    expect(text).toContain('Chart');
    expect(text).toContain('mermaid');
    expect(text).toContain('Usage guidance (relevance filter)');
    expect(text).toContain('http://localhost:7000/mdx-guide');
    expect(text).toContain('--json');
  });

  it('hints how to start the daemon when there is no live guide url', () => {
    const text = formatCapabilitiesText(getViewerCapabilities(), null);
    expect(text).toContain('artifact start');
  });

  it('lists the data-view components and read-only stance in the human output', () => {
    const text = formatCapabilitiesText(getViewerCapabilities(), null);
    expect(text).toContain('TaskList');
    expect(text).toContain('Kanban');
    expect(text).toContain('Properties');
    expect(text).toContain('src="tasks.json"');
    expect(text).toContain('read-only');
  });
});
