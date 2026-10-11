import type { Artifact } from '../../types/artifact.js';
import { ArtifactCard } from './ArtifactCard.js';
import { Inbox, SearchX } from 'lucide-react';

interface ArtifactListProps {
  artifacts: Artifact[];
  selectedSlug: string | null;
  onSelect: (artifact: Artifact) => void;
  /** Active search text: tailors the count label and empty state. */
  query?: string;
  /** Unfiltered total for the "N of M" label while searching. */
  totalCount?: number;
}

export function ArtifactList({ artifacts, selectedSlug, onSelect, query = "", totalCount }: ArtifactListProps) {
  const searching = query.trim().length > 0;
  if (artifacts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-panel-hover">
          {searching ? <SearchX className="h-8 w-8 text-text-faint" /> : <Inbox className="h-8 w-8 text-text-faint" />}
        </div>
        <h3 className="mb-2 text-base font-medium text-text-primary">
          {searching ? "No matches" : "No artifacts found"}
        </h3>
        <p className="text-sm text-text-muted">
          {searching ? (
            <>No artifacts match “{query.trim()}”.</>
          ) : (
            <>Scaffold one with <code className="rounded bg-panel-raised px-1.5 py-0.5 text-text-secondary">artifact create &lt;slug&gt;</code></>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mb-3 px-1 text-xs text-text-muted">
        {searching && totalCount !== undefined && totalCount !== artifacts.length
          ? `${artifacts.length} of ${totalCount} artifact${totalCount !== 1 ? 's' : ''}`
          : `${artifacts.length} artifact${artifacts.length !== 1 ? 's' : ''}`}
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
