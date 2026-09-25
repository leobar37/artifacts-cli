import { useQuery } from '@tanstack/react-query';
import type { Artifact, ProjectEntry } from '../../types/artifact.js';

export interface OverviewGroup {
  project: ProjectEntry;
  totalCount: number;
  artifacts: Artifact[];
}

interface UseOverviewReturn {
  groups: OverviewGroup[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

async function fetchOverview(): Promise<OverviewGroup[]> {
  const r = await fetch('/api/overview');
  if (!r.ok) throw new Error(`Failed to fetch overview: ${r.statusText}`);
  const body = (await r.json()) as { groups: OverviewGroup[] };
  return body.groups;
}

export function useOverview(): UseOverviewReturn {
  const {
    data,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['overview'],
    queryFn: fetchOverview,
    staleTime: 30_000,
  });

  return {
    groups: data ?? [],
    loading,
    error: error instanceof Error ? error : (error ? new Error(String(error)) : null),
    refetch,
  };
}
