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
    expect(documented).toEqual(new Set(['Chart', 'Stats', 'Stat', 'Callout']));
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
});
