// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { documentPainted } from '../preview.js';

function doc(state: 'loading' | 'interactive' | 'complete', children: number): Document {
  const d = document.implementation.createHTMLDocument('test');
  Object.defineProperty(d, 'readyState', { get: () => state });
  for (let i = 0; i < children; i++) {
    d.body.appendChild(document.createElement('p'));
  }
  return d;
}

describe('documentPainted', () => {
  it('true once parsed and the body has content', () => {
    expect(documentPainted(doc('interactive', 1))).toBe(true);
    expect(documentPainted(doc('complete', 3))).toBe(true);
  });

  it('false while loading, empty or missing', () => {
    expect(documentPainted(doc('loading', 3))).toBe(false);
    expect(documentPainted(doc('interactive', 0))).toBe(false); // about:blank shell
    expect(documentPainted(null)).toBe(false);
    expect(documentPainted(undefined)).toBe(false);
  });
});
