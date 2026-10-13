import type { Artifact } from '../../types/artifact.js';
import { ChevronRight, FileCode2, FileText } from 'lucide-react';

interface ArtifactCardProps {
  artifact: Artifact;
  onClick: () => void;
  isSelected: boolean;
}

const typeLabels: Record<Artifact['type'], string> = {
  generic: 'Generic',
  study: 'Study',
  wireframe: 'Wireframe',
  unknown: 'Unknown',
};

function formatDate(date: Date): string {
  const edited = new Date(date);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: edited.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(edited);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArtifactCard({ artifact, onClick, isSelected }: ArtifactCardProps) {
  const format = artifact.format || 'html';
  const edited = new Date(artifact.modifiedAt);
  const exactDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short' }).format(edited);
  const DocumentIcon = format === 'md' ? FileText : FileCode2;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={artifact.title}
      aria-pressed={isSelected}
      title={`${artifact.title}\n${typeLabels[artifact.type]} · ${format.toUpperCase()} · ${formatSize(artifact.size)}\nLast edited: ${exactDate}`}
      className={`group flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${isSelected ? 'border-line bg-panel-hover shadow-[inset_2px_0_0_var(--accent)]' : 'border-transparent hover:bg-panel-raised'}`}
    >
      <span aria-hidden="true" className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-panel-raised ${isSelected ? 'text-accent' : 'text-text-muted'}`}>
        <DocumentIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block line-clamp-2 text-[13px] font-medium leading-5 ${isSelected ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary'}`}>
          {artifact.title}
        </span>
        <span className="mt-1.5 flex items-center gap-2 text-[11px] leading-4 text-text-muted">
          <span className="rounded border border-line bg-panel-raised px-1 font-mono text-[9px] font-medium uppercase tracking-wide">{format}</span>
          <time dateTime={edited.toISOString()} title={`Last edited: ${exactDate}`}>{formatDate(artifact.modifiedAt)}</time>
        </span>
      </span>
      <ChevronRight aria-hidden="true" className={`mt-1 h-3.5 w-3.5 shrink-0 transition-opacity ${isSelected ? 'text-accent opacity-100' : 'text-text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`} />
    </button>
  );
}
