import { useQuery } from '@tanstack/react-query';
import type { ProjectEntry } from '../../types/artifact.js';

interface UseProjectsReturn {
  projects: ProjectEntry[];
  loading: boolean;
  error: Error | null;
}

async function fetchProjects(): Promise<ProjectEntry[]> {
  const r = await fetch('/api/projects');
  if (!r.ok) throw new Error(`Failed to fetch projects: ${r.statusText}`);
  const body = (await r.json()) as { projects: ProjectEntry[] };
  return body.projects;
}

export function useProjects(): UseProjectsReturn {
  const {
    data,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    staleTime: 10_000,
  });

  return {
    projects: data ?? [],
    loading,
    error: error instanceof Error ? error : (error ? new Error(String(error)) : null),
  };
}
