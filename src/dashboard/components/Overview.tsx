import { Package, AlertCircle, FolderOpen } from 'lucide-react';
import { useOverview } from '../hooks/useOverview.js';
import { ArtifactCard } from './ArtifactCard.js';

/** All artifacts of every registered project, grouped by project. Lives at `/`. */
export function Overview() {
  const { groups, loading, error, refetch } = useOverview();
  const total = groups.reduce((sum, g) => sum + g.totalCount, 0);

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-8 bg-bg">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
        <p className="text-sm text-text-muted">Loading artifacts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-8 text-center bg-bg">
        <AlertCircle className="mb-4 h-12 w-12 text-text-muted" />
        <h2 className="mb-2 text-xl font-medium text-text-primary">
          Failed to load artifacts
        </h2>
        <p className="mb-6 max-w-md text-sm text-text-muted">{error.message}</p>
        <button
          onClick={refetch}
          className="rounded-lg bg-accent px-6 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-8 text-center bg-bg">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-panel-hover">
          <Package className="h-8 w-8 text-text-faint" />
        </div>
        <h2 className="mb-2 text-xl font-medium text-text-primary">No projects registered</h2>
        <p className="max-w-md text-sm text-text-muted">
          Run <code className="rounded bg-panel-raised px-1.5 py-0.5">artifact start</code> in a
          project directory to register it.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg font-sans">
      <header className="flex flex-col border-b border-line bg-panel sticky top-0 z-20">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-medium text-text-primary">All artifacts</h1>
            <p className="text-xs text-text-muted">
              {total} artifact{total !== 1 ? 's' : ''} across {groups.length} project{groups.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-8">
        {groups.map(({ project, artifacts }) => (
          <section key={project.projectId}>
            <a
              href={`/p/${project.projectId}/`}
              className="group mb-3 flex items-center gap-2 px-1"
            >
              <FolderOpen className="h-4 w-4 text-text-faint group-hover:text-text-secondary" />
              <h2 className="text-sm font-medium text-text-primary group-hover:underline">
                {project.name}
              </h2>
              <span className="truncate text-xs text-text-faint">{project.projectPath}</span>
              <span className="ml-auto shrink-0 text-xs text-text-muted">
                {artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}
              </span>
            </a>
            {artifacts.length === 0 ? (
              <p className="px-1 text-xs text-text-faint">
                No artifacts yet — scaffold one with{' '}
                <code className="rounded bg-panel-raised px-1.5 py-0.5">artifact create &lt;slug&gt;</code>
              </p>
            ) : (
              <div className="space-y-1 rounded-xl border border-line bg-panel p-3">
                {artifacts.map((artifact) => (
                  <ArtifactCard
                    key={artifact.slug}
                    artifact={artifact}
                    isSelected={false}
                    onClick={() => {
                      window.location.href = `/p/${project.projectId}/?select=${encodeURIComponent(artifact.slug)}`;
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
