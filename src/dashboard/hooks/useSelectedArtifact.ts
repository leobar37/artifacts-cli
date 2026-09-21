import { useState } from 'react';
import type { Artifact } from '../../types/artifact.js';

export function useSelectedArtifact() {
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

  const selectArtifact = (artifact: Artifact | null) => {
    setSelectedArtifact(artifact);
  };

  return {
    selectedArtifact,
    selectArtifact,
  };
}
