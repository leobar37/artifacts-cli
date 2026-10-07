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

  it("rejects encoded traversal in artifact subpaths (P-003 sibling JSON)", () => {
    expect(sanitizeArtifactPath("/p/demo/artifacts/board/%2e%2e/secret.json")).toBeNull();
    expect(sanitizeArtifactPath("/p/demo/artifacts/board/%2E%2E/tasks.json")).toBeNull();
    expect(sanitizeArtifactPath("/p/demo/artifacts/board/%252e%252e/secret.json")).toBeNull();
    expect(sanitizeArtifactPath("/p/demo/artifacts/board/..%5csecret.json")).toBeNull();
    expect(sanitizeArtifactPath("/p/demo/artifacts/board/data%2f..%2f..%2fetc.json")).toBeNull();
  });

  it("keeps legit percent-bearing slugs and later-round decodes", () => {
    expect(sanitizeArtifactPath("/p/demo%20lab/artifacts/board%20one/tasks.json")).toBe(
      "/p/demo lab/artifacts/board one/tasks.json",
    );
    expect(sanitizeArtifactPath("/p/demo/artifacts/caf%C3%A9.json")).toBe("/p/demo/artifacts/café.json");
    expect(sanitizeArtifactPath("/p/demo/artifacts/%7etasks.json")).toBe("/p/demo/artifacts/~tasks.json");
  });
});
