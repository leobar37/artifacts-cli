import type { ProjectEntry } from '../../types/artifact.js';
import { FolderOpen, Package } from 'lucide-react';

interface ProjectPickerProps {
  projects: ProjectEntry[];
  unknownId?: string | null;
}

export function ProjectPicker({ projects, unknownId }: ProjectPickerProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center p-8 text-center bg-bg">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-panel-hover">
        <Package className="h-8 w-8 text-text-faint" />
      </div>
      <h2 className="mb-2 text-xl font-medium text-text-primary">
        {unknownId ? 'Project not registered' : 'Select a project'}
      </h2>
      {unknownId ? (
        <p className="mb-6 max-w-md text-sm text-text-muted">
          No project with id <code className="rounded bg-panel-raised px-1.5 py-0.5">{unknownId}</code> is
          registered. Run <code className="rounded bg-panel-raised px-1.5 py-0.5">artifact start</code> in
          the project directory, then pick it below.
        </p>
      ) : (
        <p className="mb-6 max-w-md text-sm text-text-muted">
          Choose a project to browse its artifacts.
        </p>
      )}
      {projects.length === 0 ? (
        <p className="max-w-md text-sm text-text-muted">
          No projects registered yet. Run{' '}
          <code className="rounded bg-panel-raised px-1.5 py-0.5">artifact start</code> in a
          project directory to register it.
        </p>
      ) : (
        <div className="w-full max-w-md space-y-1">
          {projects.map((project) => (
            <a
              key={project.projectId}
              href={`/p/${project.projectId}/`}
              className="group flex items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-panel-hover"
            >
              <FolderOpen className="h-4 w-4 shrink-0 text-text-faint group-hover:text-text-secondary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text-secondary group-hover:text-text-primary">
                  {project.name}
                </span>
                <span className="block truncate text-[11px] text-text-faint">
                  {project.projectPath}
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
