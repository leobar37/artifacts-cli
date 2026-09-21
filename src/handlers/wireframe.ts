import type { Artifact, ArtifactHandler } from "./interface.js";

function filterByType(artifacts: Artifact[], type: "wireframe"): Artifact[] {
  return artifacts.filter((a) => a.type === type);
}

function sortByModified(artifacts: Artifact[]): Artifact[] {
  return [...artifacts].sort(
    (a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime(),
  );
}

export const wireframeHandler: ArtifactHandler = {
  type: "wireframe",

  scan: async (_artifactsPath: string): Promise<Artifact[]> => {
    // Scanning is handled by the global scanner; this handler filters the results
    return [];
  },

  list(artifacts: Artifact[]): Artifact[] {
    return sortByModified(filterByType(artifacts, "wireframe"));
  },

  get(slug: string, artifacts: Artifact[]): Artifact | null {
    return (
      artifacts.find((a) => a.slug === slug && a.type === "wireframe") ?? null
    );
  },

  renderHints: Object.freeze({
    icon: "layout",
    color: "orange",
    label: "Wireframe",
    description: "Artifact con sesgo UI/layout/wireframe",
  }),
};
