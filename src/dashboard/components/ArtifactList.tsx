import type { Artifact } from '../../types/artifact.js';
import { ArtifactCard } from './ArtifactCard.js';
import { Inbox } from 'lucide-react';

interface ArtifactListProps {
  artifacts: Artifact[];
  selectedSlug: string | null;
  onSelect: (artifact: Artifact) => void;
}

export function ArtifactList({ artifacts, selectedSlug, onSelect }: ArtifactListProps) {
  if (artifacts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-panel-hover">
          <Inbox className="h-8 w-8 text-text-faint" />
        </div>
        <h3 className="mb-2 text-base font-medium text-text-primary">No artifacts found</h3>
        <p className="text-sm text-text-muted">
          Scaffold one with <code className="rounded bg-panel-raised px-1.5 py-0.5 text-text-secondary">artifact create &lt;slug&gt;</code>
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mb-3 px-1 text-xs text-text-muted">
        {artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}
      </div>
      <div className="space-y-1">
        {artifacts.map((artifact) => (
          <ArtifactCard
            key={artifact.slug}
            artifact={artifact}
            onClick={() => onSelect(artifact)}
            isSelected={selectedSlug === artifact.slug}
          />
        ))}
      </div>
    </div>
  );
}
