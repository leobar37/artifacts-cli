import { FolderOpen } from 'lucide-react';
import type { ProjectEntry } from '../../types/artifact.js';
import { ScopeSwitcher } from './ScopeSwitcher.js';

interface ProjectSwitcherProps {
  projectId: string;
  projects: ProjectEntry[];
  /** Override navigation (broker mode uses remote-qualified URLs). */
  navigate?: (projectId: string) => void;
}

export function ProjectSwitcher({ projectId, projects, navigate }: ProjectSwitcherProps) {
  return (
    <ScopeSwitcher
      label="Project"
      title="Switch project"
      icon={FolderOpen}
      currentId={projectId}
      options={[...projects].sort((a, b) => a.name.localeCompare(b.name)).map((project) => ({
        id: project.projectId,
        name: project.name,
        description: project.projectPath || 'Project on this remote',
      }))}
      onSelect={(id) => {
        if (navigate) navigate(id);
        else window.location.href = `/p/${encodeURIComponent(id)}/`;
      }}
      placeholder="Search projects…"
      overviewHref="/"
      overviewLabel={navigate ? 'All remotes and projects' : 'All projects and artifacts'}
    />
  );
}
