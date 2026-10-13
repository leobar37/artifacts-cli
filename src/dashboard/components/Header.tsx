import { useEffect, useState } from 'react';
import { Package, RefreshCw, PanelLeft, Sun, Moon, ChevronLeft } from 'lucide-react';
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

interface HeaderProps {
  total: number;
  onRefresh: () => void;
  isLoading: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  projectName?: string;
  projectId: string;
  projects: ProjectEntry[];
  /** Broker mode: show remote + textual status alongside the project. */
  remoteName?: string;
  remoteStatus?: 'online' | 'offline';
  remoteId?: string;
  remotes?: RemoteSummary[];
  onNavigateProject?: (projectId: string) => void;
  /** Optional way back (broker project view → all remotes). */
  backHref?: string;
  backLabel?: string;
}
export function Header({ total, onRefresh, isLoading, sidebarCollapsed, onToggleSidebar, projectName, projectId, projects, remoteId, remotes, onNavigateProject, backHref, backLabel }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const daemonAlive = useDaemonHealth();

  useEffect(() => {
    if (projectName) {
      document.title = projectName;
    }
  }, [projectName]);

  return (
    <header className="sticky top-0 z-20 flex shrink-0 flex-col border-b border-line bg-panel">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          {backHref && <a href={backHref} className="flex items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><ChevronLeft className="h-3.5 w-3.5" />{backLabel ?? 'Back'}</a>}
          {sidebarCollapsed && onToggleSidebar && (
            <button onClick={onToggleSidebar} className="hidden h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-panel-hover hover:text-text-primary md:flex" title="Show sidebar">
              <PanelLeft className="h-4 w-4" />
            </button>
          )}
          <a href="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Artifacts home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-panel-raised text-accent"><Package className="h-5 w-5" /></span>
            <span>
              <h1 className="text-sm font-semibold tracking-tight text-text-primary">Artifacts</h1>
              <span className="block text-[11px] tabular-nums text-text-muted">{total} artifact{total !== 1 ? 's' : ''}</span>
            </span>
          </a>
        </div>

        <div className="order-3 grid w-full min-w-0 grid-cols-2 gap-2 sm:order-none sm:flex sm:w-auto sm:items-center sm:border-l sm:border-line sm:pl-3">
          <RemoteSwitcher remoteId={remoteId} remotes={remotes} />
          <ProjectSwitcher projectId={projectId} projects={projects} navigate={onNavigateProject} />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <span title={daemonAlive ? 'Daemon connected' : 'Daemon unreachable'} className="mr-2 hidden items-center gap-1.5 text-[11px] text-text-muted lg:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${daemonAlive ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
            {daemonAlive ? 'Connected' : 'Disconnected'}
          </span>
          <button onClick={toggleTheme} className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-panel-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={onRefresh} disabled={isLoading} className="flex h-8 items-center gap-2 rounded-lg border border-line bg-panel-raised px-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-panel-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50" title="Refresh artifacts">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>
    </header>
  );
}
