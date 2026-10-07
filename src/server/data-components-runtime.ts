import { isSafeSrc, LIMITS } from "./data-contracts.js";

/**
 * Node-testable URL-boundary helpers for `src`-backed data views (P-003).
 *
 * These helpers define the exact rules the viewer boot script in
 * `markdown-viewer.ts` (dataBootScript) applies in the browser: sibling JSON
 * sources resolve against the current MDX document directory, must stay on
 * the document's origin and inside its artifact URL namespace, and every
 * response is byte-capped before parsing. The browser script cannot import
 * this module (it ships as an inline string), so the rules are mirrored
 * there on purpose; both sides stay small and aligned.
 *
 * Pure string/URL logic: no fetch, no fs, no DOM, no new dependencies.
 *
 * Artifact URL namespaces served today:
 * - local daemon:  /p/:project/artifacts/:slug/...
 * - broker proxy:  /r/:remote/p/:project/artifacts/:slug/...
 * The reserved `artifacts` segment is optional in the helpers so simplified
 * document paths (e.g. `/p/:project/:slug`) resolve the same way.
 */

/** Placeholder origin used when an input is a bare path instead of a URL. */
const PATH_BASE = "http://artifact.invalid";

/** Cap for one data source payload (NFR-002): 1 MiB UTF-8 JSON. */
export const DATA_SRC_MAX_BYTES = LIMITS.maxJsonBytes;

/** Parse an absolute path or an http(s) URL; null for anything else. */
function toUrl(value: string): URL | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value, PATH_BASE);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Artifact namespace prefix of a document path: everything up to and
 * including the slug — `/p/:project/artifacts/:slug`, `/p/:project/:slug`
 * (no reserved segment), or the same under `/r/:remote/p/...`. Null when
 * the path is not in a known artifact family (fail closed).
 */
function artifactPrefixOf(pathname: string): string | null {
  const segs = pathname.split("/");
  let i: number;
  if (segs[1] === "p") i = 2;
  else if (segs[1] === "r" && segs[3] === "p") i = 4;
  else return null;
  const parts = segs.slice(0, i + 1);
  if (segs[i + 1] === "artifacts") {
    if (!segs[i + 2]) return null;
    parts.push("artifacts", segs[i + 2]);
  } else {
    if (!segs[i + 1]) return null;
    parts.push(segs[i + 1]);
  }
  return parts.join("/");
}

/**
 * Resolve a validated sibling `src` against the MDX document path.
 *
 * Standard URL semantics: the final segment of `docUrlPath` is the document
 * file, so `src` lands in the document's directory — exactly what
 * `new URL(src, document.baseURI)` does in the viewer runtime. Nested
 * document routes are preserved. The result is a pathname (no origin, no
 * query); `src` itself may never carry one (isSafeSrc already rejects that).
 *
 * Rejection contract: returns `null` (never throws) when `src` is not a
 * safe sibling source per `isSafeSrc` (absolute, protocol-relative, scheme,
 * backslash, query, fragment, dot-dot, encoded traversal, malformed escape,
 * non-.json) or when `docUrlPath` is not an absolute path or http(s) URL.
 */
export function resolveDataUrl(docUrlPath: string, src: string): string | null {
  if (typeof docUrlPath !== "string" || typeof src !== "string") return null;
  if (!docUrlPath.startsWith("/") && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(docUrlPath)) return null;
  if (!isSafeSrc(src)) return null;
  const doc = toUrl(docUrlPath);
  if (doc === null) return null;
  const resolved = new URL(src, doc);
  if (resolved.origin !== doc.origin) return null;
  return resolved.pathname;
}

/**
 * True when `candidate` may be fetched from a page served at `docUrl`:
 * same origin (skipped for path-only candidates, which inherit the page
 * origin by construction) and containment in the document's artifact
 * namespace prefix (see {@link artifactPrefixOf}). Either input may be a
 * bare absolute path or a full http(s) URL; other schemes are rejected.
 */
export function isSameArtifactUrl(candidate: string, docUrl: string): boolean {
  const cand = toUrl(candidate);
  const doc = toUrl(docUrl);
  if (cand === null || doc === null) return false;
  // Path-only candidates inherit the page origin by construction, so only
  // candidates carrying an explicit origin must match the document origin.
  const pathOnly = candidate.startsWith("/");
  if (!pathOnly && cand.origin !== doc.origin) return false;
  const prefix = artifactPrefixOf(doc.pathname);
  if (prefix === null) return false;
  return cand.pathname === prefix || cand.pathname.startsWith(`${prefix}/`);
}

/**
 * Post-fetch redirect check: true when the final response URL must be
 * blocked (cross-origin or outside the document's artifact namespace).
 * `finalUrl` is `response.url` — always a full URL after `redirect: follow`.
 */
export function isBlockedRedirect(finalUrl: string, docUrl: string): boolean {
  return !isSameArtifactUrl(finalUrl, docUrl);
}

/** Streaming byte-cap accumulator shared by the viewer runtime rules. */
export interface ByteCap {
  readonly limit: number;
  readonly total: number;
  readonly exceeded: boolean;
  /** Add a chunk's byte length; returns true once the cap is exceeded. */
  feed(bytes: number): boolean;
}

/**
 * Byte cap for streamed responses: rejects payloads over `limit`
 * (default {@link DATA_SRC_MAX_BYTES} = 1 MiB) even when no trustworthy
 * Content-Length exists. Hitting exactly `limit` is allowed; one byte more
 * is not. `exceeded` is sticky.
 */
export function createByteCap(limit: number = DATA_SRC_MAX_BYTES): ByteCap {
  let total = 0;
  let exceeded = false;
  return {
    get limit() {
      return limit;
    },
    get total() {
      return total;
    },
    get exceeded() {
      return exceeded;
    },
    feed(bytes: number): boolean {
      total += bytes;
      if (total > limit) exceeded = true;
      return exceeded;
    },
  };
}
