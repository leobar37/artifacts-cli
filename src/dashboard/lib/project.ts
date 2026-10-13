/** Project routing helpers. Local dashboard lives under `/p/<projectId>/`;
 * every project-scoped URL (API, SSE, iframe, bundle) is built from that base.
 * At `/` (no project) only the global `/api/projects` list is used.
 *
 * Broker mode adds canonical `/r/<remoteId>/` and
 * `/r/<remoteId>/p/<projectId>/` routes. No React Router — full-page
 * navigation is sufficient.
 */
import type { ArtifactFormat } from '../../types/artifact.js';

export interface DashboardRoute {
  mode: "root" | "local" | "remote";
  remoteId: string | null;
  projectId: string | null;
}

export function getProjectIdFromPath(pathname: string = window.location.pathname): string | null {
  const match = pathname.match(/^\/p\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function parseDashboardRoute(pathname: string = window.location.pathname): DashboardRoute {
  const remoteProject = pathname.match(/^\/r\/([^/]+)\/p\/([^/]+)/);
  if (remoteProject) {
    return { mode: "remote", remoteId: decodeURIComponent(remoteProject[1]), projectId: decodeURIComponent(remoteProject[2]) };
  }
  const remoteRoot = pathname.match(/^\/r\/([^/]+)/);
  if (remoteRoot) {
    return { mode: "remote", remoteId: decodeURIComponent(remoteRoot[1]), projectId: null };
  }
  const local = pathname.match(/^\/p\/([^/]+)/);
  if (local) {
    return { mode: "local", remoteId: null, projectId: decodeURIComponent(local[1]) };
  }
  return { mode: "root", remoteId: null, projectId: null };
}

export function projectBase(projectId: string | null = getProjectIdFromPath()): string {
  return projectId ? `/p/${projectId}` : "";
}

export function apiUrl(path: string, projectId: string | null = getProjectIdFromPath()): string {
  return `${projectBase(projectId)}/api${path}`;
}

/** Canonical broker builders — the sole remote-qualified URL source. */
export function remoteUrl(remoteId: string): string {
  return `/r/${encodeURIComponent(remoteId)}/`;
}

export function remoteProjectUrl(remoteId: string, projectId: string): string {
  return `/r/${encodeURIComponent(remoteId)}/p/${encodeURIComponent(projectId)}/`;
}

function remoteScope(remoteId: string, projectId: string): string {
  return `/r/${encodeURIComponent(remoteId)}/p/${encodeURIComponent(projectId)}`;
}

export function remoteApiUrl(remoteId: string, projectId: string, path: string): string {
  return `${remoteScope(remoteId, projectId)}/api${path}`;
}

/** Entry filename inside docs/artifacts/<slug>/ for each storage format. */
export function artifactEntryFile(format: ArtifactFormat = 'html'): string {
  return format === 'md' ? 'index.md' : format === 'mdx' ? 'index.mdx' : 'index.html';
}

/** Same-origin preview URL for an artifact's entry file (plus query). */
export function previewUrl(
  remoteId: string,
  projectId: string,
  slug: string,
  query = "",
  format: ArtifactFormat = 'html',
): string {
  return `${remoteScope(remoteId, projectId)}/artifacts/${encodeURIComponent(slug)}/${artifactEntryFile(format)}${query}`;
}

/** Same-origin SSE URL for a remote project. */
export function eventsUrl(remoteId: string, projectId: string): string {
  return remoteApiUrl(remoteId, projectId, "/events");
}

/** A page is a source file within the selected artifact, never a URL or traversal path. */
export function isArtifactPagePath(page: string): boolean {
  if (!/\.(mdx?|html)$/.test(page) || /[\\%?#\u0000-\u001f\u007f]/.test(page)) return false;
  return page.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..') && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(page);
}

/** Read same-origin iframe navigation without trusting paths outside this artifact's scope. */
export function getArtifactPagePath(url: string, context: { origin: string; projectId: string; slug: string; remoteId?: string }): string | null {
  try {
    const parsed = new URL(url, context.origin);
    if (parsed.origin !== context.origin) return null;
    const scope = context.remoteId ? remoteScope(context.remoteId, context.projectId) : context.projectId ? `/p/${encodeURIComponent(context.projectId)}` : '';
    const prefix = `${scope}/artifacts/${encodeURIComponent(context.slug)}/`;
    if (!parsed.pathname.startsWith(prefix)) return null;
    const page = decodeURIComponent(parsed.pathname.slice(prefix.length));
    return isArtifactPagePath(page) ? page : null;
  } catch {
    return null;
  }
}
