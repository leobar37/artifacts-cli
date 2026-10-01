import { AlertCircle, FolderOpen, Package, Server } from 'lucide-react';
import { useBrokerOverview } from '../hooks/useRemotes.js';
import type { Artifact, ArtifactWire } from '../../types/artifact.js';
import { ArtifactCard } from './ArtifactCard.js';
import { remoteProjectUrl, remoteUrl } from '../lib/project.js';

function wireToLocal(a: ArtifactWire): Artifact {
  return {
    slug: a.slug,
    title: a.title,
    path: a.relativePath,
    relativePath: a.relativePath,
    type: a.type,
    format: a.format,
    createdAt: new Date(a.createdAt),
    modifiedAt: new Date(a.modifiedAt),
    size: a.size,
  };
}

/** Broker root: `remote → project → artifact` with stored offline catalogs. */
export function BrokerOverview() {
  const { remotes, loading, error, refetch } = useBrokerOverview();
  const total = remotes.reduce((n, g) => n + g.projects.reduce((m, p) => m + p.totalCount, 0), 0);

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-8 bg-bg">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
        <p className="text-sm text-text-muted">Loading remotes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-8 text-center bg-bg">
        <AlertCircle className="mb-4 h-12 w-12 text-text-muted" />
        <h2 className="mb-2 text-xl font-medium text-text-primary">Failed to load remotes</h2>
        <p className="mb-6 max-w-md text-sm text-text-muted">{error.message}</p>
        <button
          onClick={() => refetch()}
          className="rounded-lg bg-accent px-6 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (remotes.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-8 text-center bg-bg">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-panel-hover">
          <Server className="h-8 w-8 text-text-faint" />
        </div>
        <h2 className="mb-2 text-xl font-medium text-text-primary">No remotes registered</h2>
        <p className="max-w-md text-sm text-text-muted">
          Start an agent with <code className="rounded bg-panel-raised px-1.5 py-0.5">artifact agent start --broker &lt;url&gt;</code> and it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg font-sans">
      <header className="flex flex-col border-b border-line bg-panel sticky top-0 z-20">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-medium text-text-primary">All remotes</h1>
            <p className="text-xs text-text-muted">
              {total} artifact{total !== 1 ? 's' : ''} across {remotes.length} remote{remotes.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-8">
        {remotes.map(({ remote, projects }) => (
          <section key={remote.remoteId}>
            <a href={remoteUrl(remote.remoteId)} className="group mb-3 flex items-center gap-2 px-1">
              <Server className="h-4 w-4 text-text-faint group-hover:text-text-secondary" />
              <h2 className="text-sm font-medium text-text-primary group-hover:underline">{remote.name}</h2>
              <span className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium text-text-muted">
                {remote.status === 'online' ? 'Online' : 'Offline'}
              </span>
              <span className="truncate text-xs text-text-faint">
                {remote.status === 'online' ? `${remote.projectCount} projects` : `last seen ${remote.lastSeenAt}`}
              </span>
              <span className="ml-auto shrink-0 text-xs text-text-muted">
                {remote.artifactCount} artifact{remote.artifactCount !== 1 ? 's' : ''}
              </span>
            </a>
            {projects.length === 0 ? (
              <p className="px-1 text-xs text-text-faint">No projects reported yet.</p>
            ) : (
              <div className="space-y-4">
                {projects.map(({ project, artifacts }) => (
                  <div key={project.projectId}>
                    <a href={remoteProjectUrl(remote.remoteId, project.projectId)} className="group mb-2 flex items-center gap-2 px-1">
                      <FolderOpen className="h-4 w-4 text-text-faint group-hover:text-text-secondary" />
                      <h3 className="text-sm font-medium text-text-primary group-hover:underline">{project.name}</h3>
                      <span className="ml-auto shrink-0 text-xs text-text-muted">
                        {artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}
                      </span>
                    </a>
                    {artifacts.length === 0 ? (
                      <p className="px-1 text-xs text-text-faint">No artifacts yet.</p>
                    ) : (
                      <div className="space-y-1 rounded-xl border border-line bg-panel p-3">
                        {artifacts.map((wire) => {
                          const artifact = wireToLocal(wire);
                          return (
                            <ArtifactCard
                              key={wire.slug}
                              artifact={artifact}
                              isSelected={false}
                              onClick={() => {
                                window.location.href = `${remoteProjectUrl(remote.remoteId, project.projectId)}?select=${encodeURIComponent(wire.slug)}`;
                              }}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
