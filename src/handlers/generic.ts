import type { Artifact, ArtifactHandler } from './interface.js';

function filterByType(artifacts: Artifact[], type: 'generic'): Artifact[] {
  return artifacts.filter(a => a.type === type);
}

function sortByModified(artifacts: Artifact[]): Artifact[] {
  return [...artifacts].sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
}

export const genericHandler: ArtifactHandler = {
  type: 'generic',

  scan: async (_artifactsPath: string): Promise<Artifact[]> => {
    // Scanning is handled by the global scanner; this handler filters the results
    return [];
  },

  list(artifacts: Artifact[]): Artifact[] {
    return sortByModified(filterByType(artifacts, 'generic'));
  },

  get(slug: string, artifacts: Artifact[]): Artifact | null {
    return artifacts.find(a => a.slug === slug && a.type === 'generic') ?? null;
  },

  renderHints: Object.freeze({
    icon: 'file-text',
    color: 'blue',
    label: 'Generic',
    description: 'Generic visual artifact with no specific bias',
  }),
};
