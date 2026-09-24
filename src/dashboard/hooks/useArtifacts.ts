import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArtifactIndex, Artifact } from '../../types/artifact.js';
import { useArtifactEvents } from './useArtifactEvents.js';
import { apiUrl, getProjectIdFromPath } from '../lib/project.js';

type ArtifactType = 'generic' | 'study' | 'wireframe';

interface UseArtifactsOptions {
  type?: ArtifactType | 'all';
  eventFilter?: (event: { slug: string; lastScanAt: string }) => boolean;
}

interface UseArtifactsReturn {
  artifacts: Artifact[];
  total: number;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

async function fetchArtifactIndex(projectId: string, type?: ArtifactType | 'all'): Promise<ArtifactIndex> {
  const url = type && type !== 'all' ? apiUrl(`/artifacts?type=${type}`, projectId) : apiUrl('/artifacts', projectId);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch artifacts: ${r.statusText}`);
  return r.json();
}

export function useArtifacts({ type, eventFilter }: UseArtifactsOptions = {}): UseArtifactsReturn {
  const queryClient = useQueryClient();
  const projectId = getProjectIdFromPath() ?? '';

  const {
    data,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['artifacts', projectId, type],
    queryFn: () => fetchArtifactIndex(projectId, type),
    staleTime: 30_000,
  });

  useArtifactEvents({
    filter: eventFilter,
    onEvent: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    },
  });

  return {
    artifacts: data?.artifacts ?? [],
    total: data?.totalCount ?? 0,
    loading,
    error: error instanceof Error ? error : (error ? new Error(String(error)) : null),
    refetch,
  };
}
