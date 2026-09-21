import type { Artifact } from '../../types/artifact.js';

interface ArtifactCardProps {
  artifact: Artifact;
  onClick: () => void;
  isSelected: boolean;
}

const typeColors: Record<Artifact['type'], string> = {
  generic: 'badge-generic',
  study: 'badge-study',
  wireframe: 'badge-wireframe',
  unknown: 'badge-unknown',
};

const typeLabels: Record<Artifact['type'], string> = {
  generic: 'Generic',
  study: 'Study',
  wireframe: 'Wireframe',
  unknown: 'Unknown',
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArtifactCard({ artifact, onClick, isSelected }: ArtifactCardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        group cursor-pointer rounded-xl p-3 transition-all duration-200
        ${isSelected
          ? 'bg-panel-raised'
          : 'hover:bg-panel-hover'
        }
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className={`text-sm font-medium leading-snug line-clamp-2 flex-1 transition-colors ${isSelected ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary'}`}>
          {artifact.title}
        </h3>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium ${typeColors[artifact.type]}`}>
          {typeLabels[artifact.type]}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-text-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-1 rounded-full bg-text-faint"></span>
          {formatDate(artifact.modifiedAt)}
        </span>
        <span className="rounded bg-panel-hover px-1.5 py-0.5 text-text-muted">
          {formatSize(artifact.size)}
        </span>
      </div>
    </div>
  );
}
