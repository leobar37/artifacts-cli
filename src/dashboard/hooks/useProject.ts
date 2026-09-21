import { useQuery } from '@tanstack/react-query';

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

async function fetchProjectInfo(): Promise<ProjectInfo> {
  const r = await fetch('/api/project');
  if (!r.ok) throw new Error(`Failed to fetch project info: ${r.statusText}`);
  return r.json();
}

export function useProject(): UseProjectReturn {
  const {
    data,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ['project'],
    queryFn: fetchProjectInfo,
    staleTime: Infinity, // Project info doesn't change during runtime
  });

  return {
    name: data?.name ?? 'Loading...',
    path: data?.path ?? '',
    loading,
    error: error instanceof Error ? error : (error ? new Error(String(error)) : null),
  };
}
