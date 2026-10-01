import { useEffect, useState } from "react";
import type { Artifact, ProjectEntry, RemoteSummary } from "../types/artifact.js";
import { useArtifacts } from "./hooks/useArtifacts.js";
import { useSelectedArtifact } from "./hooks/useSelectedArtifact.js";
import { useProject } from "./hooks/useProject.js";
import { useProjects } from "./hooks/useProjects.js";
import { useRuntimeInfo } from "./hooks/useRuntimeInfo.js";
import { findRemoteGroup, useBrokerOverview, useBrokerProject } from "./hooks/useRemotes.js";
import { getProjectIdFromPath, parseDashboardRoute, remoteProjectUrl, remoteUrl } from "./lib/project.js";
import { Header } from "./components/Header.js";
import { ArtifactList } from "./components/ArtifactList.js";
import { ArtifactViewer } from "./components/ArtifactViewer.js";
import { ProjectPicker } from "./components/ProjectPicker.js";
import { Overview } from "./components/Overview.js";
import { BrokerOverview } from "./components/BrokerOverview.js";
import { RemoteSwitcher } from "./components/RemoteSwitcher.js";
import { ProjectSwitcher } from "./components/ProjectSwitcher.js";
import { ChevronRight, ChevronLeft, X, AlertCircle, FolderOpen, Server } from "lucide-react";

type ArtifactType = "generic" | "study" | "wireframe";

export default function App() {
  const { role, loading: runtimeLoading } = useRuntimeInfo();

  if (runtimeLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-8 bg-bg">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  if (role === "broker") {
    return <BrokerApp />;
  }
  return <LocalApp />;
}

// --- Local mode (unchanged behavior) -----------------------------------------

function LocalApp() {
  const projectId = getProjectIdFromPath();
  const { projects, loading: projectsLoading } = useProjects();

  if (projectsLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-8 bg-bg">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
        <p className="text-sm text-text-muted">Loading artifacts...</p>
      </div>
    );
  }

  // No project in the URL: show every artifact of every project.
  if (!projectId) {
    return <Overview />;
  }
  const project = projects.find((p) => p.projectId === projectId);
  if (!project) {
    return <ProjectPicker projects={projects} unknownId={projectId} />;
  }

  return <ProjectDashboard project={project} projects={projects} />;
}

// --- Broker mode --------------------------------------------------------------

function BrokerApp() {
  const route = parseDashboardRoute();
  const { remotes, loading } = useBrokerOverview();

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-8 bg-bg">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
        <p className="text-sm text-text-muted">Loading remotes...</p>
      </div>
    );
  }

  // Root overview.
  if (route.mode === "root" || (route.mode === "local")) {
    return <BrokerOverview />;
  }

  const group = route.remoteId ? findRemoteGroup(remotes, route.remoteId) : null;
  if (!group) {
    return <UnknownRemote remoteId={route.remoteId} remotes={remotes.map((g) => g.remote)} />;
  }

  // Remote drill-down: project list for one remote.
  if (!route.projectId) {
    return <RemoteDetail remote={group.remote} remotes={remotes.map((g) => g.remote)} projects={group.projects.map((p) => p.project)} />;
  }

  const found = group.projects.find((p) => p.project.projectId === route.projectId);
  if (!found) {
    return <UnknownBrokerProject remote={group.remote} remotes={remotes.map((g) => g.remote)} projectId={route.projectId} projects={group.projects.map((p) => p.project)} />;
  }

  return <BrokerProjectDashboard remote={group.remote} remotes={remotes.map((g) => g.remote)} projectId={found.project.projectId} />;
}

/** Global broker nav stays mounted; scoped failures render in the panel. */
function BrokerShell({ remote, remotes, children }: { remote: RemoteSummary | null; remotes: RemoteSummary[]; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg font-sans">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-3">
        <a href="/" className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <Server className="h-4 w-4 text-text-faint" />
          All remotes
        </a>
        {remotes.length > 0 && remote && <RemoteSwitcher remoteId={remote.remoteId} remotes={remotes} />}
        {remote && (
          <span className="text-xs font-medium text-text-secondary">
            {remote.name} · {remote.status === 'online' ? 'Online' : 'Offline'}
          </span>
        )}
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function UnknownRemote({ remoteId, remotes }: { remoteId: string | null; remotes: RemoteSummary[] }) {
  return (
    <BrokerShell remote={null} remotes={remotes}>
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-text-muted" />
        <h2 className="mb-2 text-xl font-medium text-text-primary">Unknown remote</h2>
        <p className="mb-6 text-sm text-text-muted">
          {remoteId ? `No remote "${remoteId}" on this broker.` : 'No remote selected.'} It may have been removed.
        </p>
        <a href="/" className="rounded-lg bg-accent px-6 py-2 text-sm font-medium text-accent-text hover:bg-accent-hover">
          Back to all remotes
        </a>
      </div>
    </BrokerShell>
  );
}

function RemoteDetail({ remote, remotes, projects }: { remote: RemoteSummary; remotes: RemoteSummary[]; projects: { projectId: string; name: string }[] }) {
  return (
    <BrokerShell remote={remote} remotes={remotes}>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h1 className="text-base font-medium text-text-primary">{remote.name}</h1>
          <span className="rounded-md px-2 py-0.5 text-[10px] font-medium text-text-muted">
            {remote.status === 'online' ? 'Online' : 'Offline'}
          </span>
          {remote.status === 'offline' && (
            <span className="text-xs text-text-faint">last seen {remote.lastSeenAt}</span>
          )}
          <span className="ml-auto text-xs text-text-muted">
            {projects.length} project{projects.length !== 1 ? 's' : ''} · {remote.artifactCount} artifact{remote.artifactCount !== 1 ? 's' : ''}
          </span>
        </div>
        {projects.length === 0 ? (
          <p className="text-sm text-text-faint">This remote has no projects yet.</p>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <a
                key={p.projectId}
                href={remoteProjectUrl(remote.remoteId, p.projectId)}
                className="group flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-3"
              >
                <FolderOpen className="h-4 w-4 text-text-faint group-hover:text-text-secondary" />
                <span className="text-sm font-medium text-text-primary group-hover:underline">{p.name}</span>
                <ChevronRight className="ml-auto h-4 w-4 text-text-faint" />
              </a>
            ))}
          </div>
        )}
      </main>
    </BrokerShell>
  );
}

function UnknownBrokerProject({ remote, remotes, projectId, projects }: {
  remote: RemoteSummary;
  remotes: RemoteSummary[];
  projectId: string | null;
  projects: { projectId: string; name: string }[];
}) {
  return (
    <BrokerShell remote={remote} remotes={remotes}>
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-text-muted" />
        <h2 className="mb-2 text-xl font-medium text-text-primary">Unknown project</h2>
        <p className="mb-6 text-sm text-text-muted">
          {projectId ? `No project "${projectId}" on ${remote.name}.` : 'No project selected.'}
        </p>
        <div className="mb-6 flex flex-wrap justify-center gap-2">
          {projects.length > 1 && (
            <ProjectSwitcher projectId={projectId ?? ''} projects={projects.map((p) => ({ ...p, projectPath: '', addedAt: '' }))} navigate={(id) => { window.location.href = remoteProjectUrl(remote.remoteId, id); }} />
          )}
        </div>
        <a href={remoteUrl(remote.remoteId)} className="rounded-lg bg-accent px-6 py-2 text-sm font-medium text-accent-text hover:bg-accent-hover">
          Back to {remote.name}
        </a>
      </div>
    </BrokerShell>
  );
}

export function BrokerProjectDashboard({ remote, remotes, projectId }: { remote: RemoteSummary; remotes: RemoteSummary[]; projectId: string }) {
  const [selectedType, setSelectedType] = useState<ArtifactType | "all">("all");
  const { project, artifacts, total, loading, error, refetch } = useBrokerProject(remote.remoteId, projectId, selectedType === 'all' ? undefined : selectedType);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewerMaximized, setViewerMaximized] = useState(false);

  // Deep link: /r/<remote>/p/<id>/?select=<slug>
  useEffect(() => {
    if (selectedSlug || artifacts.length === 0) return;
    const slug = new URLSearchParams(window.location.search).get("select");
    if (!slug) return;
    if (artifacts.some((a) => a.slug === slug)) {
      setSelectedSlug(slug);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [artifacts, selectedSlug]);

  const selectedArtifact: Artifact | null = (() => {
    const found = artifacts.find((a) => a.slug === selectedSlug);
    if (!found) return null;
    return {
      slug: found.slug,
      title: found.title,
      path: found.relativePath,
      relativePath: found.relativePath,
      type: found.type,
      format: found.format,
      createdAt: new Date(found.createdAt),
      modifiedAt: new Date(found.modifiedAt),
      size: found.size,
    };
  })();

  if (error) {
    // Keep global broker navigation; show the failure in the content panel.
    return (
      <BrokerShell remote={remote} remotes={remotes}>
        <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-12 text-center">
          <AlertCircle className="mb-4 h-12 w-12 text-text-muted" />
          <h2 className="mb-2 text-xl font-medium text-text-primary">Failed to load project</h2>
          <p className="mb-6 max-w-md text-sm text-text-muted">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="rounded-lg bg-accent px-6 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover"
          >
            Try Again
          </button>
        </div>
      </BrokerShell>
    );
  }

  const effectiveSidebarCollapsed = sidebarCollapsed || viewerMaximized;

  return (
    <div className="flex min-h-dvh flex-col bg-bg font-sans">
      {!viewerMaximized && (
        <BrokerProjectHeader
          remote={remote}
          remotes={remotes}
          projectId={projectId}
          projectName={project?.name ?? 'Loading...'}
          total={total}
          onRefresh={() => refetch()}
          isLoading={loading}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          selectedType={selectedType}
          onSelectType={setSelectedType}
        />
      )}

      <div className={`flex ${viewerMaximized ? "h-dvh" : "flex-1"} overflow-hidden relative`}>
        <aside
          className={`border-r border-line bg-panel transition-all duration-300 ease-in-out z-10
            ${effectiveSidebarCollapsed ? "w-0 overflow-hidden opacity-0" : "w-full md:w-80 lg:w-96 opacity-100"}`}
        >
          {loading && artifacts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
              <p className="text-sm text-text-muted">Loading artifacts...</p>
            </div>
          ) : (
            <ArtifactList
              artifacts={selectedArtifact ? [selectedArtifact, ...wireList(artifacts).filter((a) => a.slug !== selectedArtifact.slug)] : wireList(artifacts)}
              selectedSlug={selectedArtifact?.slug || null}
              onSelect={(a) => setSelectedSlug(a?.slug ?? null)}
            />
          )}
        </aside>

        {!viewerMaximized && (
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`
              hidden md:flex items-center justify-center absolute left-0 top-1/2 -translate-y-1/2 -ml-3 z-20
              h-8 w-6 bg-panel border border-line rounded-r-md
              text-text-muted hover:text-text-secondary transition-colors
              ${!effectiveSidebarCollapsed ? "left-80 lg:left-96 ml-0 rounded-l-md border-l-0" : "rounded-l-none border-l-0"}
            `}
            title={effectiveSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{ transform: effectiveSidebarCollapsed ? "translateY(-50%)" : "translate(-100%, -50%)" }}
          >
            {effectiveSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}

        <div className="hidden flex-1 md:flex relative z-0 overflow-hidden">
          <div className="flex-1 min-w-0">
            <ArtifactViewer
              artifact={selectedArtifact}
              isMaximized={viewerMaximized}
              onToggleMaximize={() => setViewerMaximized(!viewerMaximized)}
              remote={{ remoteId: remote.remoteId, projectId, remote }}
            />
          </div>
        </div>
      </div>

      {/* Mobile: artifact list → full-screen preview overlay with safe-area padding */}
      {selectedArtifact && (
        <div className="mobile-preview-overlay fixed inset-0 z-50 bg-bg/95 backdrop-blur-md md:hidden">
          <div className="flex h-full min-h-dvh flex-col">
            <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-3">
              <h2 className="truncate text-sm font-medium text-text-primary">{selectedArtifact.title}</h2>
              <button
                onClick={() => setSelectedSlug(null)}
                className="rounded-lg p-2 text-text-muted hover:bg-panel-hover hover:text-text-primary transition-colors"
                aria-label="Close preview"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ArtifactViewer
                artifact={selectedArtifact}
                remote={{ remoteId: remote.remoteId, projectId, remote }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function wireList(artifacts: { slug: string; title: string; relativePath: string; type: Artifact['type']; format: Artifact['format']; createdAt: string; modifiedAt: string; size: number }[]): Artifact[] {
  return artifacts.map((a) => ({
    slug: a.slug,
    title: a.title,
    path: a.relativePath,
    relativePath: a.relativePath,
    type: a.type,
    format: a.format,
    createdAt: new Date(a.createdAt),
    modifiedAt: new Date(a.modifiedAt),
    size: a.size,
  }));
}

function BrokerProjectHeader({ remote, remotes, projectId, projectName, total, onRefresh, isLoading, sidebarCollapsed, onToggleSidebar, selectedType, onSelectType }: {
  remote: RemoteSummary;
  remotes: RemoteSummary[];
  projectId: string;
  projectName: string;
  total: number;
  onRefresh: () => void;
  isLoading: boolean;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  selectedType: ArtifactType | 'all';
  onSelectType: (t: ArtifactType | 'all') => void;
}) {
  const { remotes: overview } = useBrokerOverview();
  const group = findRemoteGroup(overview, remote.remoteId);
  const scoped: ProjectEntry[] = (group?.projects ?? []).map((p) => ({
    projectId: p.project.projectId,
    projectPath: '',
    name: p.project.name,
    addedAt: p.project.addedAt,
  }));
  return (
    <Header
      total={total}
      onRefresh={onRefresh}
      isLoading={isLoading}
      sidebarCollapsed={sidebarCollapsed}
      onToggleSidebar={onToggleSidebar}
      selectedType={selectedType}
      onSelectType={onSelectType}
      projectName={projectName}
      projectId={projectId}
      projects={scoped}
      remoteName={remote.name}
      remoteStatus={remote.status}
      remoteId={remote.remoteId}
      remotes={remotes}
      onNavigateProject={(id) => { window.location.href = remoteProjectUrl(remote.remoteId, id); }}
    />
  );
}

export function ProjectDashboard({ project, projects }: { project: ProjectEntry; projects: ProjectEntry[] }) {
  const [selectedType, setSelectedType] = useState<ArtifactType | "all">("all");
  const { artifacts, total, loading, error, refetch } = useArtifacts({
    type: selectedType,
  });
  const { selectedArtifact, selectArtifact } = useSelectedArtifact();
  const { name: projectName } = useProject();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewerMaximized, setViewerMaximized] = useState(false);

  const handleSelectArtifact = (artifact: Artifact | null) => {
    selectArtifact(artifact);
  };

  // Deep link from the overview: /p/<id>/?select=<slug>
  useEffect(() => {
    if (selectedArtifact || artifacts.length === 0) return;
    const slug = new URLSearchParams(window.location.search).get("select");
    if (!slug) return;
    const found = artifacts.find((a) => a.slug === slug);
    if (found) {
      selectArtifact(found);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [artifacts, selectedArtifact, selectArtifact]);

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

  const effectiveSidebarCollapsed = sidebarCollapsed || viewerMaximized;

  return (
    <div className="flex h-screen flex-col bg-bg font-sans">
      {!viewerMaximized && (
        <Header
          total={total}
          onRefresh={refetch}
          isLoading={loading}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          selectedType={selectedType}
          onSelectType={setSelectedType}
          projectName={projectName}
          projectId={project.projectId}
          projects={projects}
        />
      )}

      <div
        className={`flex ${viewerMaximized ? "h-screen" : "flex-1"} overflow-hidden relative`}
      >
        {/* Sidebar */}
        <aside
          className={`
            border-r border-line bg-panel transition-all duration-300 ease-in-out z-10
            ${effectiveSidebarCollapsed ? "w-0 overflow-hidden opacity-0" : "w-full md:w-80 lg:w-96 opacity-100"}
          `}
        >
          {loading && artifacts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
              <p className="text-sm text-text-muted">
                Loading artifacts...
              </p>
            </div>
          ) : (
            <ArtifactList
              artifacts={artifacts}
              selectedSlug={selectedArtifact?.slug || null}
              onSelect={handleSelectArtifact}
            />
          )}
        </aside>

        {/* Sidebar Toggle */}
        {!viewerMaximized && (
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`
              hidden md:flex items-center justify-center absolute left-0 top-1/2 -translate-y-1/2 -ml-3 z-20
              h-8 w-6 bg-panel border border-line rounded-r-md
              text-text-muted hover:text-text-secondary transition-colors
              ${!effectiveSidebarCollapsed ? "left-80 lg:left-96 ml-0 rounded-l-md border-l-0" : "rounded-l-none border-l-0"}
            `}
            title={effectiveSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              transform: effectiveSidebarCollapsed
                ? "translateY(-50%)"
                : "translate(-100%, -50%)",
            }}
          >
            {effectiveSidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        )}

        {/* Main viewer */}
        <div className="hidden flex-1 md:flex relative z-0 overflow-hidden">
          <div className="flex-1 min-w-0">
            <ArtifactViewer
              artifact={selectedArtifact}
              isMaximized={viewerMaximized}
              onToggleMaximize={() => setViewerMaximized(!viewerMaximized)}
            />
          </div>
        </div>
      </div>

      {/* Mobile viewer */}
      {selectedArtifact && (
        <div className="mobile-preview-overlay fixed inset-0 z-50 bg-bg/95 backdrop-blur-md md:hidden">
          <div className="flex h-full min-h-dvh flex-col">
            <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-3">
              <h2 className="truncate text-sm font-medium text-text-primary">
                {selectedArtifact.title}
              </h2>
              <button
                onClick={() => handleSelectArtifact(null)}
                className="rounded-lg p-2 text-text-muted hover:bg-panel-hover hover:text-text-primary transition-colors"
                aria-label="Close preview"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ArtifactViewer artifact={selectedArtifact} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
