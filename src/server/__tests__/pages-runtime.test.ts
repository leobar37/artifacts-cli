import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderMarkdownBody } from '../markdown-viewer.js';
import { PAGES_BOOT_SCRIPT } from '../pages-runtime.js';

const SOURCE = '<Pages title="Guide" items={[{ title: "Overview", href: "index.mdx" }, { title: "Details", href: "details.mdx" }, { title: "Appendix", href: "appendix.mdx" }]} />';
// Only the trusted built-in runtime is executed, never author-supplied MDX code.
const boot = new Function('document', 'location', 'URL', 'URLSearchParams', PAGES_BOOT_SCRIPT.replace(/<\/?script>/g, ''));
let dom: JSDOM;
let document: Document;
beforeEach(() => {
  dom = new JSDOM('', { url: 'http://100.83.90.33:5173/' });
  document = dom.window.document;
});

afterEach(() => {
  dom.window.close();
});

describe('multi-page navigation runtime', () => {
  it('marks the active page and creates previous/next links in declared order', () => {
    dom.window.history.replaceState(null, '', '/r/r1/p/p1/artifacts/guide/details.mdx?theme=light');
    document.body.innerHTML = renderMarkdownBody(SOURCE, 'mdx');
    boot(document, dom.window.location, dom.window.URL, dom.window.URLSearchParams);
    expect(document.querySelector('[aria-current="page"]')?.textContent).toContain('Details');
    expect(document.querySelector('a[rel="prev"]')?.getAttribute('href')).toContain('/r/r1/p/p1/artifacts/guide/index.mdx?theme=light');
    expect(document.querySelector('a[rel="next"]')?.getAttribute('href')).toContain('/r/r1/p/p1/artifacts/guide/appendix.mdx?theme=light');
    expect(document.querySelector('.mv-pages-steps')?.textContent).toContain('Page 2 of 3');
    expect(document.querySelector('.mv-pages-steps')?.hasAttribute('hidden')).toBe(false);
  });

  it('keeps native links and omits unavailable previous/next steps at the boundaries', () => {
    for (const [page, absent] of [['index.mdx', 'prev'], ['appendix.mdx', 'next']] as const) {
      dom.window.history.replaceState(null, '', `/p/p1/artifacts/guide/${page}`);
      document.body.innerHTML = renderMarkdownBody(SOURCE, 'mdx');
      boot(document, dom.window.location, dom.window.URL, dom.window.URLSearchParams);
      expect(document.querySelector(`a[rel="${absent}"]`)).toBeNull();
      expect(document.querySelectorAll('.mv-pages-items a')).toHaveLength(3);
    }
  });
});
