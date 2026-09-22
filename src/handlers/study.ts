import type { Artifact, ArtifactHandler } from "./interface.js";

function filterByType(artifacts: Artifact[], type: "study"): Artifact[] {
  return artifacts.filter((a) => a.type === type);
}

function sortByModified(artifacts: Artifact[]): Artifact[] {
  return [...artifacts].sort(
    (a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime(),
  );
}

export const studyHandler: ArtifactHandler = {
  type: "study",

  scan: async (_artifactsPath: string): Promise<Artifact[]> => {
    // Scanning is handled by the global scanner; this handler filters the results
    return [];
  },

  list(artifacts: Artifact[]): Artifact[] {
    return sortByModified(filterByType(artifacts, "study"));
  },

  get(slug: string, artifacts: Artifact[]): Artifact | null {
    return artifacts.find((a) => a.slug === slug && a.type === "study") ?? null;
  },

  renderHints: Object.freeze({
    icon: "book-open",
    color: "purple",
    label: "Study",
    description: "Explanatory/educational artifact",
  }),
};
