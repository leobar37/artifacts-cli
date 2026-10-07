import { describe, expect, it } from "vitest";
import {
  DATA_SRC_MAX_BYTES,
  createByteCap,
  isBlockedRedirect,
  isSameArtifactUrl,
  resolveDataUrl,
} from "../data-components-runtime.js";

describe("resolveDataUrl", () => {
  const doc = "/p/proj/artifacts/board/index.mdx";

  it("resolves sibling sources against the document directory", () => {
    expect(resolveDataUrl(doc, "tasks.json")).toBe("/p/proj/artifacts/board/tasks.json");
  });

  it("resolves nested sources under the document directory", () => {
    expect(resolveDataUrl(doc, "data/tasks.json")).toBe("/p/proj/artifacts/board/data/tasks.json");
    expect(resolveDataUrl(doc, "./tasks.json")).toBe("/p/proj/artifacts/board/tasks.json");
  });

  it("preserves nested document routes", () => {
    expect(resolveDataUrl("/p/proj/artifacts/board/guide/part1.mdx", "tasks.json")).toBe(
      "/p/proj/artifacts/board/guide/tasks.json",
    );
  });

  it("resolves under broker-qualified document URLs", () => {
    expect(resolveDataUrl("/r/rem/p/proj/artifacts/board/index.mdx", "tasks.json")).toBe(
      "/r/rem/p/proj/artifacts/board/tasks.json",
    );
    expect(resolveDataUrl("/r/rem/p/proj/artifacts/board/guide/part1.mdx", "data/t.json")).toBe(
      "/r/rem/p/proj/artifacts/board/guide/data/t.json",
    );
  });

  it("ignores a document query string", () => {
    expect(resolveDataUrl(`${doc}?raw=1`, "tasks.json")).toBe("/p/proj/artifacts/board/tasks.json");
  });

  it("rejects unsafe sources with null (documented contract: never throws)", () => {
    for (const src of [
      "/tasks.json", // absolute
      "//cdn.example/tasks.json", // protocol-relative
      "https://evil.example/tasks.json", // scheme
      "javascript:alert(1)//x.json", // scheme hiding a .json suffix
      "back\\slash.json", // backslash
      "tasks.json?q=1", // query
      "tasks.json#frag", // fragment
      "../tasks.json", // dot-dot
      "%2e%2e/tasks.json", // encoded traversal
      "%252e%252e/tasks.json", // repeated encoding
      "bad%zz.json", // malformed escape
      "notes.md", // non-.json
      "", // empty
    ]) {
      expect(resolveDataUrl(doc, src)).toBeNull();
    }
  });

  it("rejects invalid document paths", () => {
    expect(resolveDataUrl("relative/doc.mdx", "tasks.json")).toBeNull();
    expect(resolveDataUrl("", "tasks.json")).toBeNull();
    expect(resolveDataUrl("ftp://host/p/proj/artifacts/board/index.mdx", "tasks.json")).toBeNull();
  });
});

describe("isSameArtifactUrl", () => {
  const doc = "/p/proj/artifacts/board/index.mdx";

  it("accepts siblings and nested data inside the document's artifact", () => {
    expect(isSameArtifactUrl("/p/proj/artifacts/board/tasks.json", doc)).toBe(true);
    expect(isSameArtifactUrl("/p/proj/artifacts/board/data/t.json", doc)).toBe(true);
  });

  it("accepts containment from nested document routes", () => {
    expect(
      isSameArtifactUrl("/p/proj/artifacts/board/tasks.json", "/p/proj/artifacts/board/guide/doc.mdx"),
    ).toBe(true);
  });

  it("supports broker-qualified namespaces", () => {
    expect(
      isSameArtifactUrl(
        "/r/rem/p/proj/artifacts/board/tasks.json",
        "/r/rem/p/proj/artifacts/board/guide/doc.mdx",
      ),
    ).toBe(true);
  });

  it("rejects other slugs, projects, and prefix look-alikes", () => {
    expect(isSameArtifactUrl("/p/proj/artifacts/other/tasks.json", doc)).toBe(false);
    expect(isSameArtifactUrl("/p/other/artifacts/board/tasks.json", doc)).toBe(false);
    // `slug-evil/...` must not pass a `slug` prefix check.
    expect(isSameArtifactUrl("/p/proj/artifacts/board-evil/tasks.json", doc)).toBe(false);
  });

  it("rejects URL-normalized traversal out of the artifact", () => {
    expect(isSameArtifactUrl("/p/proj/artifacts/board/../other/tasks.json", doc)).toBe(false);
  });

  it("rejects cross-origin candidates that carry an explicit origin", () => {
    expect(isSameArtifactUrl("https://preview.example/p/proj/artifacts/board/tasks.json", doc)).toBe(false);
    expect(
      isSameArtifactUrl(
        "https://preview.example/p/proj/artifacts/board/tasks.json",
        "https://preview.example/p/proj/artifacts/board/index.mdx",
      ),
    ).toBe(true);
    expect(
      isSameArtifactUrl(
        "https://evil.example/p/proj/artifacts/board/tasks.json",
        "https://preview.example/p/proj/artifacts/board/index.mdx",
      ),
    ).toBe(false);
  });

  it("rejects unknown namespaces, non-http schemes, and malformed input", () => {
    expect(isSameArtifactUrl("/p/proj/artifacts/board/tasks.json", "/not-a-family/doc.mdx")).toBe(false);
    expect(isSameArtifactUrl("/p/proj/artifacts/board/tasks.json", "/p/proj/artifacts")).toBe(false);
    expect(isSameArtifactUrl("ftp://host/p/proj/artifacts/board/tasks.json", doc)).toBe(false);
    expect(isSameArtifactUrl("", doc)).toBe(false);
    expect(isSameArtifactUrl("/p/proj/artifacts/board/tasks.json", "not-a-url-or-path")).toBe(false);
  });
});

describe("isBlockedRedirect", () => {
  const doc = "https://preview.example/p/proj/artifacts/board/index.mdx";

  it("allows redirects that stay inside the artifact namespace", () => {
    expect(isBlockedRedirect("https://preview.example/p/proj/artifacts/board/tasks.json", doc)).toBe(false);
    expect(isBlockedRedirect("https://preview.example/p/proj/artifacts/board/data/t.json", doc)).toBe(false);
  });

  it("blocks cross-origin and namespace-escaping redirects", () => {
    expect(isBlockedRedirect("https://evil.example/tasks.json", doc)).toBe(true);
    expect(isBlockedRedirect("https://preview.example/p/proj/artifacts/other/tasks.json", doc)).toBe(true);
    expect(isBlockedRedirect("https://preview.example/p/proj/artifacts/board-evil/tasks.json", doc)).toBe(true);
  });

  it("fails closed on malformed final URLs", () => {
    expect(isBlockedRedirect("not a url", doc)).toBe(true);
  });
});

describe("createByteCap", () => {
  it("defaults to the 1 MiB source cap", () => {
    expect(createByteCap().limit).toBe(1024 * 1024);
    expect(DATA_SRC_MAX_BYTES).toBe(1024 * 1024);
  });

  it("allows payloads up to the limit and rejects one byte more", () => {
    const cap = createByteCap(100);
    expect(cap.feed(60)).toBe(false);
    expect(cap.feed(40)).toBe(false);
    expect(cap.total).toBe(100);
    expect(cap.exceeded).toBe(false);
    expect(cap.feed(1)).toBe(true);
    expect(cap.total).toBe(101);
  });

  it("flags an oversized single chunk immediately", () => {
    const cap = createByteCap();
    expect(cap.feed(1024 * 1024 + 1)).toBe(true);
  });

  it("keeps exceeded sticky", () => {
    const cap = createByteCap(10);
    cap.feed(11);
    expect(cap.feed(0)).toBe(true);
    expect(cap.exceeded).toBe(true);
  });
});
