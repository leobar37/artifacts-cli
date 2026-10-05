/**
 * Preview reveal heuristics for the artifact iframe.
 *
 * HTML artifacts commonly pull Tailwind/Alpine from CDNs; when the network
 * to a CDN is slow or blocked, the iframe `load` event pends even though the
 * document already painted. The viewer therefore reveals the preview as soon
 * as the same-origin document has a parsed body — without waiting for every
 * subresource.
 */
export const PAINT_POLL_MS = 300;

export function documentPainted(doc: Document | null | undefined): boolean {
  if (!doc) return false;
  if (doc.readyState !== 'interactive' && doc.readyState !== 'complete') return false;
  // about:blank and empty shells stay hidden: no body children, nothing painted.
  return !!doc.body && doc.body.childNodes.length > 0;
}

/** Safe accessor for the sandboxed-but-same-origin preview document. */
export function previewDocumentPainted(iframe: HTMLIFrameElement | null): boolean {
  try {
    return documentPainted(iframe?.contentDocument);
  } catch {
    // Cross-origin access throws: only the load event can reveal.
    return false;
  }
}
