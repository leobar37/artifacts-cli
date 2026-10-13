import type { Artifact } from '../../types/artifact.js';
import { ArtifactCard } from './ArtifactCard.js';
import { Clock3, Inbox, Library, PanelLeftClose, SearchX } from 'lucide-react';
import { SearchInput } from './SearchInput.js';

interface ArtifactListProps {
  artifacts: Artifact[];
  selectedSlug: string | null;
  onSelect: (artifact: Artifact) => void;
  /** Active search text: tailors the count label and empty state. */
  query?: string;
  /** Unfiltered total for the "N of M" label while searching. */
  totalCount?: number;
  onQueryChange: (value: string) => void;
  onCollapse?: () => void;
}

export function ArtifactList({ artifacts, selectedSlug, onSelect, query = "", totalCount, onQueryChange, onCollapse }: ArtifactListProps) {
  const searching = query.trim().length > 0;
  const countLabel = searching && totalCount !== undefined && totalCount !== artifacts.length
    ? `${artifacts.length} of ${totalCount} artifact${totalCount !== 1 ? 's' : ''}`
    : `${artifacts.length} artifact${artifacts.length !== 1 ? 's' : ''}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xs font-semibold text-text-primary">
            <Library className="h-4 w-4 text-text-muted" />
            Library
          </h2>
          {onCollapse && (
            <button type="button" onClick={onCollapse} title="Collapse sidebar" aria-label="Collapse sidebar" className="hidden h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-panel-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:flex">
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <SearchInput value={query} onChange={onQueryChange} placeholder="Search artifacts…" ariaLabel="Search artifacts" />
        <div className="mt-3 flex items-center justify-between gap-2 text-[10px] font-medium text-text-muted">
          <span className="flex items-center gap-1.5"><Clock3 className="h-3 w-3" />Recently edited</span>
          <span className="tabular-nums">{countLabel}</span>
        </div>
      </div>

      <nav aria-label="Artifact library" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {artifacts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-panel-raised">
              {searching ? <SearchX className="h-5 w-5 text-text-muted" /> : <Inbox className="h-5 w-5 text-text-muted" />}
            </div>
            <h3 className="mb-2 text-sm font-medium text-text-primary">{searching ? "No matches" : "No artifacts found"}</h3>
            <p className="text-xs leading-relaxed text-text-muted">
              {searching ? <>No artifacts match “{query.trim()}”.</> : <>Scaffold one with <code className="rounded bg-panel-raised px-1.5 py-0.5 text-text-secondary">artifact create &lt;slug&gt;</code></>}
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {artifacts.map((artifact) => (
              <li key={artifact.slug}>
                <ArtifactCard artifact={artifact} onClick={() => onSelect(artifact)} isSelected={selectedSlug === artifact.slug} />
              </li>
            ))}
          </ul>
        )}
      </nav>
    </div>
  );
}
