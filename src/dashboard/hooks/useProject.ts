import { useQuery } from '@tanstack/react-query';
import { apiUrl, getProjectIdFromPath } from '../lib/project.js';

interface ProjectInfo {
  name: string;
  path: string;
}

interface UseProjectReturn {
  name: string;
  path: string;
  loading: boolean;
  error: Error | null;
}

async function fetchProjectInfo(projectId: string): Promise<ProjectInfo> {
  const r = await fetch(apiUrl('/project', projectId));
  if (!r.ok) throw new Error(`Failed to fetch project info: ${r.statusText}`);
  return r.json();
}

export function useProject(): UseProjectReturn {
  const projectId = getProjectIdFromPath() ?? '';
  const {
    data,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProjectInfo(projectId),
    staleTime: Infinity, // Project info doesn't change during runtime
  });
  return {
    name: data?.name ?? 'Loading...',
    path: data?.path ?? '',
    loading,
    error: error instanceof Error ? error : (error ? new Error(String(error)) : null),
  };
}
