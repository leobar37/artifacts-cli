import { useQuery } from '@tanstack/react-query';

export type ServerRole = "local" | "broker";

interface RuntimeInfo {
  role: ServerRole;
  version: string;
}

async function fetchRuntimeInfo(): Promise<RuntimeInfo> {
  const r = await fetch('/api/health');
  if (!r.ok) throw new Error(`Failed to fetch runtime info: ${r.statusText}`);
  const body = (await r.json()) as { role?: ServerRole; version?: string };
  return { role: body.role === "broker" ? "broker" : "local", version: body.version ?? "unknown" };
}

/** Branch the dashboard on the serving role: local daemon vs broker. */
export function useRuntimeInfo() {
  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['runtime'],
    queryFn: fetchRuntimeInfo,
    staleTime: Infinity,
  });
  return {
    role: data?.role ?? "local" as ServerRole,
    version: data?.version ?? "unknown",
    loading,
    error: error instanceof Error ? error : (error ? new Error(String(error)) : null),
  };
}
