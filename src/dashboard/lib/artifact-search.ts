/** Client-side artifact search helpers (dashboard only, no API changes).
 * Matching is case- and accent-insensitive; multi-word queries AND tokens.
 */

export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function matchesText(haystack: string, query: string): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const text = normalizeSearchText(haystack);
  return q.split(/\s+/).every((token) => text.includes(token));
}

export interface SearchableArtifact {
  title: string;
  slug: string;
}

/** Title or slug match (slug covers/kebab-case and/or ids users remember). */
export function matchesArtifact<T extends SearchableArtifact>(artifact: T, query: string): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const tokens = q.split(/\s+/);
  const title = normalizeSearchText(artifact.title);
  const slug = normalizeSearchText(artifact.slug);
  return tokens.every((token) => title.includes(token) || slug.includes(token));
}

export function filterArtifacts<T extends SearchableArtifact>(artifacts: T[], query: string): T[] {
  if (!normalizeSearchText(query)) return artifacts;
  return artifacts.filter((a) => matchesArtifact(a, query));
}
