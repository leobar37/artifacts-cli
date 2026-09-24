import { useEffect } from 'react';
import { Package, RefreshCw, PanelLeft, Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme.js';
import type { ProjectEntry } from '../../types/artifact.js';

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
}

const typeFilters: { value: ArtifactType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'generic', label: 'Generic' },
  { value: 'study', label: 'Study' },
  { value: 'wireframe', label: 'Wireframe' },
];

export function Header({ total, onRefresh, isLoading, sidebarCollapsed, onToggleSidebar, selectedType, onSelectType, projectName, projectId, projects }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (projectName) {
      document.title = projectName;
    }
  }, [projectName]);

  return (
    <header className="flex flex-col border-b border-line bg-panel sticky top-0 z-20">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {sidebarCollapsed && onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-panel-hover hover:text-text-secondary transition-colors"
              title="Show sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-medium text-text-primary">{projectName || 'Artifact CLI'}</h1>
            <p className="text-xs text-text-muted">
              {total} artifact{total !== 1 ? 's' : ''}
            </p>
          </div>
          {projects.length > 1 && (
            <select
              value={projectId}
              onChange={(e) => { window.location.href = `/p/${e.target.value}/`; }}
              title="Switch project"
              className="max-w-48 truncate rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-text-secondary hover:bg-panel-hover"
            >
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>{p.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
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
      <div className="flex gap-1 px-4 pb-3">
        {typeFilters.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onSelectType(value)}
            className={`
              rounded-lg px-3 py-1.5 text-xs font-medium transition-colors
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
