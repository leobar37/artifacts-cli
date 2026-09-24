/** Project routing helpers. The dashboard lives under `/p/<projectId>/`;
 * every project-scoped URL (API, SSE, iframe, bundle) is built from that base.
 * At `/` (no project) only the global `/api/projects` list is used.
 */

export function getProjectIdFromPath(pathname: string = window.location.pathname): string | null {
  const match = pathname.match(/^\/p\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function projectBase(projectId: string | null = getProjectIdFromPath()): string {
  return projectId ? `/p/${projectId}` : "";
}

export function apiUrl(path: string, projectId: string | null = getProjectIdFromPath()): string {
  return `${projectBase(projectId)}/api${path}`;
}
