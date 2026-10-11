import { describe, it, expect } from "vitest";
import { filterArtifacts, matchesArtifact, matchesText, normalizeSearchText } from "./artifact-search.js";

const ITEMS = [
  { title: "Códigos de descuento", slug: "codigos-descuento" },
  { title: "Molly · Flyers de inauguración", slug: "molly-flyers" },
  { title: "Release board", slug: "release-board" },
];

describe("normalizeSearchText", () => {
  it("lowercases, trims and strips accents", () => {
    expect(normalizeSearchText("  CÓDIGOS de Descuento ")).toBe("codigos de descuento");
  });
});

describe("matchesText", () => {
  it("matches case- and accent-insensitively", () => {
    expect(matchesText("Códigos de descuento", "codigos")).toBe(true);
    expect(matchesText("Molly · Flyers", "MOLLY")).toBe(true);
  });

  it("ANDs multiple tokens", () => {
    expect(matchesText("Molly Flyers inauguración", "molly cutervo")).toBe(false);
    expect(matchesText("Molly Flyers inauguración", "molly flyers")).toBe(true);
  });

  it("empty query matches everything", () => {
    expect(matchesText("anything", "")).toBe(true);
    expect(matchesText("anything", "   ")).toBe(true);
  });

  it("rejects non-matches", () => {
    expect(matchesText("Release board", "molly")).toBe(false);
  });
});

describe("matchesArtifact / filterArtifacts", () => {
  it("matches slugs as well as titles", () => {
    expect(matchesArtifact(ITEMS[2], "release-board")).toBe(true);
    expect(filterArtifacts(ITEMS, "molly")).toHaveLength(1);
  });

  it("empty query returns the same list", () => {
    expect(filterArtifacts(ITEMS, "")).toBe(ITEMS);
  });

  it("returns no items when nothing matches", () => {
    expect(filterArtifacts(ITEMS, "zzz-no-match")).toHaveLength(0);
  });
});
