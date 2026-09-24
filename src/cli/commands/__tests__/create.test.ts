import { describe, it, expect } from "vitest";
import {
  buildHtmlTemplate,
  buildTsxTemplate,
  componentName,
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

  it("derives a valid component name", () => {
    expect(componentName("auth-summary")).toBe("AuthSummary");
    expect(componentName("a")).toBe("A");
  });

  it("scaffolds html with title and type meta", () => {
    const html = buildHtmlTemplate("Auth Summary", "study");
    expect(html).toContain("<title>Auth Summary</title>");
    expect(html).toContain('name="artifact-type" content="study"');
  });

  it("scaffolds a default-exported tsx component", () => {
    const tsx = buildTsxTemplate("Auth Summary", "AuthSummary");
    expect(tsx).toContain("export default function AuthSummary()");
    expect(tsx).toContain("<h1>Auth Summary</h1>");
  });
});
