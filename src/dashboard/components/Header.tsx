import { useEffect, useState } from 'react';
import { Package, RefreshCw, PanelLeft, Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme.js';
import type { ProjectEntry, RemoteSummary } from '../../types/artifact.js';
import { ProjectSwitcher } from './ProjectSwitcher.js';
import { RemoteSwitcher } from './RemoteSwitcher.js';
function useDaemonHealth(): boolean {
  const [alive, setAlive] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const res = await fetch('/api/health');
        if (!cancelled) setAlive(res.ok);
      } catch {
        if (!cancelled) setAlive(false);
      }
    };
    void probe();
    const timer = setInterval(() => void probe(), 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return alive;
}

type ArtifactType = 'generic' | 'study' | 'wireframe';

interface HeaderProps {
  total: number;
  onRefresh: () => void;
  isLoading: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  selectedType: ArtifactType | 'all';
  onSelectType: (type: ArtifactType | 'all') => void;
  projectName?: string;
  projectId: string;
  projects: ProjectEntry[];
  /** Broker mode: show remote + textual status alongside the project. */
  remoteName?: string;
  remoteStatus?: 'online' | 'offline';
  remoteId?: string;
  remotes?: RemoteSummary[];
  onNavigateProject?: (projectId: string) => void;
}
const typeFilters: { value: ArtifactType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'generic', label: 'Generic' },
  { value: 'study', label: 'Study' },
  { value: 'wireframe', label: 'Wireframe' },
];

export function Header({ total, onRefresh, isLoading, sidebarCollapsed, onToggleSidebar, selectedType, onSelectType, projectName, projectId, projects, remoteName, remoteStatus, remoteId, remotes, onNavigateProject }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const daemonAlive = useDaemonHealth();

  useEffect(() => {
    if (projectName) {
      document.title = projectName;
    }
  }, [projectName]);

  return (
    <header className="flex flex-col border-b border-line bg-panel sticky top-0 z-20">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 md:gap-3">
          {sidebarCollapsed && onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-panel-hover hover:text-text-secondary transition-colors"
              title="Show sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Package className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium text-text-primary">
              {remoteName ? `${remoteName} / ${projectName || '…'}` : (projectName || 'Artifact CLI')}
            </h1>
            <p className="flex items-center gap-2 text-xs text-text-muted">
              <span>{total} artifact{total !== 1 ? 's' : ''}</span>
              {remoteStatus && (
                <span className="font-medium text-text-secondary">{remoteStatus === 'online' ? 'Online' : 'Offline'}</span>
              )}
            </p>
          </div>
          {remotes && remoteId && (
            <RemoteSwitcher remoteId={remoteId} remotes={remotes} />
          )}
          {projects.length > 1 && (
            <ProjectSwitcher projectId={projectId} projects={projects} navigate={onNavigateProject} />
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            title={daemonAlive ? 'Daemon connected' : 'Daemon unreachable'}
            className={`h-2 w-2 rounded-full ${daemonAlive ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}
          />
          <button
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-panel-hover hover:text-text-secondary transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className={`
              flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors
              ${isLoading
                ? 'cursor-not-allowed opacity-50'
                : 'text-text-secondary hover:bg-panel-hover hover:text-text-primary'
              }
            `}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Type Filter Tabs */}
      <div className="flex gap-1 overflow-x-auto px-4 pb-3">
        {typeFilters.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onSelectType(value)}
            className={`
              shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors
              ${selectedType === value
                ? 'bg-accent text-accent-text'
                : 'text-text-muted hover:bg-panel-hover hover:text-text-secondary'
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>
    </header>
  );
}
