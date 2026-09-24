import { describe, it, expect } from "vitest";
import {
  buildHtmlTemplate,
  humanizeSlug,
  isValidSlug,
} from "../create.js";

describe("artifact create templates", () => {
  it("accepts kebab-case slugs only", () => {
    expect(isValidSlug("auth-summary")).toBe(true);
    expect(isValidSlug("a1-b2")).toBe(true);
    expect(isValidSlug("Auth")).toBe(false);
    expect(isValidSlug("has space")).toBe(false);
    expect(isValidSlug("../escape")).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });

  it("humanizes slugs for default titles", () => {
    expect(humanizeSlug("auth-summary")).toBe("Auth Summary");
    expect(humanizeSlug("a")).toBe("A");
  });

  it("scaffolds html with title and type meta", () => {
    const html = buildHtmlTemplate("Auth Summary", "study");
    expect(html).toContain("<title>Auth Summary</title>");
    expect(html).toContain('name="artifact-type" content="study"');
  });
});
