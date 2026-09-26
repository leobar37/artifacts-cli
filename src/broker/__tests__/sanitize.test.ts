import { describe, it, expect } from "vitest";
import { sanitizeArtifactPath } from "../index.js";

describe("sanitizeArtifactPath", () => {
  it("accepts normal preview paths and strips queries", () => {
    expect(sanitizeArtifactPath("/demo/index.html")).toBe("/demo/index.html");
    expect(sanitizeArtifactPath("/demo/index.html?v=3")).toBe("/demo/index.html");
    expect(sanitizeArtifactPath("demo/index.html")).toBe("/demo/index.html");
    expect(sanitizeArtifactPath("/my%20site/index.html")).toBe("/my site/index.html");
  });

  it("rejects decoded dot-dot, backslash, and NUL segments", () => {
    expect(sanitizeArtifactPath("/../manifest.json")).toBeNull();
    expect(sanitizeArtifactPath("/..%5c..%5cmanifest.json")).toBeNull();
    expect(sanitizeArtifactPath("/%5Cevil")).toBeNull();
    expect(sanitizeArtifactPath("/%00evil")).toBeNull();
    expect(sanitizeArtifactPath("/a/../../b")).toBeNull();
  });

  it("catches double-encoded traversal", () => {
    expect(sanitizeArtifactPath("/%252E%252E/manifest.json")).toBeNull();
  });

  it("rejects malformed first-level encodings", () => {
    expect(sanitizeArtifactPath("/100%xx/index.html")).toBeNull();
  });
});
