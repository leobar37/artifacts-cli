import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ArtifactWire, RemoteCatalogProject, RemoteOverviewGroup, RemoteSummary } from '../../types/artifact.js';
import { eventsUrl } from '../lib/project.js';

async function fetchRemotes(): Promise<RemoteSummary[]> {
  const r = await fetch('/api/remotes');
  if (!r.ok) throw new Error(`Failed to fetch remotes: ${r.statusText}`);
  const body = (await r.json()) as { remotes: RemoteSummary[] };
  return body.remotes;
}

/** Live remote list; polls every 15s so lease expiry/recovery shows up. */
export function useRemotes() {
  const { data, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['remotes'],
    queryFn: fetchRemotes,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  return {
    remotes: data ?? [],
    loading,
    error: error instanceof Error ? error : (error ? new Error(String(error)) : null),
    refetch,
  };
}

async function fetchBrokerOverview(): Promise<RemoteOverviewGroup[]> {
  const r = await fetch('/api/overview');
  if (!r.ok) throw new Error(`Failed to fetch overview: ${r.statusText}`);
  const body = (await r.json()) as { remotes: RemoteOverviewGroup[] };
  return body.remotes;
}

/** Broker catalog overview (stored snapshots, incl. offline remotes). */
export function useBrokerOverview() {
  const { data, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['broker-overview'],
    queryFn: fetchBrokerOverview,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  return {
    remotes: data ?? [],
    loading,
    error: error instanceof Error ? error : (error ? new Error(String(error)) : null),
    refetch,
  };
}

export interface BrokerProjectData {
  project: RemoteCatalogProject['project'];
  artifacts: ArtifactWire[];
  totalCount: number;
}

async function fetchBrokerProject(remoteId: string, projectId: string, type?: string): Promise<BrokerProjectData> {
  const q = type && type !== 'all' ? `?type=${encodeURIComponent(type)}` : '';
  const [artifactsRes, projectRes] = await Promise.all([
    fetch(`/r/${encodeURIComponent(remoteId)}/p/${encodeURIComponent(projectId)}/api/artifacts${q}`),
    fetch(`/r/${encodeURIComponent(remoteId)}/p/${encodeURIComponent(projectId)}/api/project`),
  ]);
  if (!artifactsRes.ok) throw new Error(`Failed to fetch artifacts: ${artifactsRes.statusText}`);
  if (!projectRes.ok) throw new Error(`Failed to fetch project: ${projectRes.statusText}`);
  const a = (await artifactsRes.json()) as { artifacts: ArtifactWire[]; totalCount: number };
  const p = (await projectRes.json()) as { project: BrokerProjectData['project'] };
  return { project: p.project, artifacts: a.artifacts, totalCount: a.totalCount };
}

export function useBrokerProject(remoteId: string, projectId: string, type?: string) {
  const queryClient = useQueryClient();
  const { data, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['broker-project', remoteId, projectId, type],
    queryFn: () => fetchBrokerProject(remoteId, projectId, type),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const es = new EventSource(eventsUrl(remoteId, projectId));
    es.addEventListener('artifacts:update', () => {
      queryClient.invalidateQueries({ queryKey: ['broker-project', remoteId, projectId] });
      queryClient.invalidateQueries({ queryKey: ['broker-overview'] });
    });
    es.onerror = () => {};
    return () => es.close();
  }, [remoteId, projectId, queryClient]);

  return {
    project: data?.project ?? null,
    artifacts: data?.artifacts ?? [],
    total: data?.totalCount ?? 0,
    loading,
    error: error instanceof Error ? error : (error ? new Error(String(error)) : null),
    refetch,
  };
}

/** Find one remote's catalog group (for drill-down / switchers). */
export function findRemoteGroup(remotes: RemoteOverviewGroup[], remoteId: string): RemoteOverviewGroup | null {
  return remotes.find((g) => g.remote.remoteId === remoteId) ?? null;
}
