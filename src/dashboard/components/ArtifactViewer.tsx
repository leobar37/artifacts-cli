import { useState, useEffect, useRef, useCallback } from 'react';
import type { Artifact, RemoteSummary } from '../../types/artifact.js';
import { useArtifactEvents } from '../hooks/useArtifactEvents.js';
import { eventsUrl, previewUrl, projectBase, artifactEntryFile } from '../lib/project.js';
import { PAINT_POLL_MS, previewDocumentPainted } from '../lib/preview.js';
import { Maximize2, Minimize2, Box, AlertTriangle, RefreshCw, ServerOff } from 'lucide-react';

export interface RemoteViewerContext {
  remoteId: string;
  projectId: string;
  remote: RemoteSummary;
}

interface ArtifactViewerProps {
  artifact: Artifact | null;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  /** Absent = current local URL/SSE behavior. Present = broker mode. */
  remote?: RemoteViewerContext;
}

const LOAD_TIMEOUT_MS = 15000;

type LoadError = 'unreachable' | 'timeout' | 'not-found' | 'offline-upstream' | null;

async function isDaemonReachable(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    return res.ok;
  } catch {
    return false;
  }
}

/** Classify the same-origin preview before mounting the iframe. */
async function preflightPreview(url: string): Promise<LoadError> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) return null;
    if (res.status === 404) return 'not-found';
    if (res.status === 503) return 'offline-upstream';
    return 'unreachable';
  } catch {
    return 'unreachable';
  }
}

export function ArtifactViewer({ artifact, isMaximized, onToggleMaximize, remote }: ArtifactViewerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<LoadError>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paintRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRetriedRef = useRef(false);
  const isOffline = !!remote && remote.remote.status === 'offline';
  const [refreshKey, setRefreshKey] = useState(0);
  // Markdown previews are rendered by the server-side viewer page: pass the
  // dashboard theme so reading follows it (re-read per render, no extra
  // stateful hook applying global side effects).
  const themeQuery =
    artifact?.format === 'md' || artifact?.format === 'mdx'
      ? `&theme=${document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'}`
      : '';
  const previewSrc = artifact
    ? remote
      ? previewUrl(remote.remoteId, remote.projectId, artifact.slug, `?v=${refreshKey}${themeQuery}`, artifact.format)
      : `${projectBase()}/artifacts/${artifact.slug}/${artifactEntryFile(artifact.format)}?v=${refreshKey}${themeQuery}`
    : null;



  // Stable identity: reveal/startLoading depend on it; a fresh inline
  // function restarts the loading effect on every parent re-render (6ac821d).
  const stretchHtmlArtifact = useCallback(() => {
    try {
      const iframe = iframeRef.current;
      if (!iframe) return;

      const doc = iframe.contentDocument;
      if (!doc || !doc.head) return;

      const styleId = 'artifact-viewer-full-width-override';
      const existing = doc.getElementById(styleId);
      if (existing) return;

      const style = doc.createElement('style');
      style.id = styleId;
      style.textContent = `
        [class*="max-w-"] { max-width: none !important; }
        .container { max-width: none !important; }
      `;

      doc.head.appendChild(style);
    } catch {
      // Cross-origin or unloaded iframe: stretching is best-effort only.
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (paintRef.current) {
      clearInterval(paintRef.current);
      paintRef.current = null;
    }
  }, []);

  // Latest props via refs so timeout/loading callbacks keep a stable identity
  // across parent re-renders. Catalog polls mint fresh `remote` objects every
  // 15s; depending on that identity restarted the spinner forever.
  const artifactRef = useRef(artifact);
  artifactRef.current = artifact;
  const remoteRef = useRef(remote);
  remoteRef.current = remote;

  const handleTimeout = useCallback(async () => {
    const a = artifactRef.current;
    const r = remoteRef.current;
    if (r) {
      const err = await preflightPreview(previewUrl(r.remoteId, r.projectId, a?.slug ?? ''));
      if (err) {
        setLoadError(err === 'offline-upstream' ? 'offline-upstream' : err);
        setIsLoading(false);
        return;
      }
    } else if (!(await isDaemonReachable())) {
      setLoadError('unreachable');
      setIsLoading(false);
      return;
    }
    if (!autoRetriedRef.current) {
      autoRetriedRef.current = true;
      setRefreshKey((k) => k + 1);
      timerRef.current = setTimeout(() => void handleTimeout(), LOAD_TIMEOUT_MS);
      return;
    }
    setLoadError('timeout');
    setIsLoading(false);
  }, []);

  const reveal = useCallback(() => {
    clearTimer();
    stretchHtmlArtifact();
    setIsLoading(false);
  }, [clearTimer, stretchHtmlArtifact]);

  const startLoading = useCallback(() => {
    clearTimer();
    autoRetriedRef.current = false;
    setLoadError(null);
    setIsLoading(true);
    timerRef.current = setTimeout(() => void handleTimeout(), LOAD_TIMEOUT_MS);
    // Reveal on paint: HTML artifacts with slow CDN subresources never fire
    // `load`, but the same-origin document is parsed and visible much earlier.
    paintRef.current = setInterval(() => {
      if (previewDocumentPainted(iframeRef.current)) reveal();
    }, PAINT_POLL_MS);
  }, [clearTimer, handleTimeout, reveal]);

  const retry = useCallback(() => {
    startLoading();
    setRefreshKey((k) => k + 1);
  }, [startLoading]);

  const reloadArtifact = useCallback(() => {
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.contentWindow?.location.reload();
    }
    setRefreshKey((k) => k + 1);
  }, []);

  const brokerEventsUrl = remote ? eventsUrl(remote.remoteId, remote.projectId) : null;
  const slugFilter = artifact?.slug ?? null;
  useEffect(() => {
    if (!brokerEventsUrl || !slugFilter || isOffline) return;
    const es = new EventSource(brokerEventsUrl);
    es.addEventListener('artifacts:update', (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data) as { slug: string };
        if (event.slug === slugFilter) reloadArtifact();
      } catch {
        // ignore parse errors
      }
    });
    es.onerror = () => {};
    return () => es.close();
  }, [brokerEventsUrl, slugFilter, isOffline, reloadArtifact]);

  useArtifactEventsLocal(remote == null, artifact?.slug ?? null, reloadArtifact);

  // Primitive scope key: only real scope changes (artifact, remote, status)
  // restart loading — never object identity from polls.
  const scopeKey = remote ? `${remote.remoteId}/${remote.projectId}/${remote.remote.status}` : 'local';
  useEffect(() => {
    if (!artifact || isOffline) {
      clearTimer();
      setIsLoading(false);
      return;
    }
    startLoading();
    return clearTimer;
  }, [artifact?.slug, scopeKey, isOffline, startLoading, clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  if (!artifact) {
    return (
      <div className="flex h-full w-full flex-1 flex-col items-center justify-center p-8 text-center bg-bg">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-panel-hover">
          <Box className="h-8 w-8 text-text-faint" />
        </div>
        <h3 className="mb-2 text-xl font-medium text-text-primary">Select an artifact</h3>
        <p className="text-sm text-text-muted">
          Choose an artifact from the sidebar to view its contents
        </p>
      </div>
    );
  }

  // Offline remote: no iframe, no EventSource — catalog metadata only.
  if (isOffline && remote) {
    return (
      <div className="flex h-full w-full flex-1 flex-col items-center justify-center p-8 text-center bg-bg">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-panel-hover">
          <ServerOff className="h-8 w-8 text-text-faint" />
        </div>
        <h3 className="mb-2 text-xl font-medium text-text-primary">Remote offline</h3>
        <p className="mb-1 text-sm text-text-muted">
          {remote.remote.name} is Offline — preview unavailable until it returns.
        </p>
        <p className="mb-6 text-xs text-text-faint">Last seen {remote.remote.lastSeenAt}</p>
        <button
          onClick={retry}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-accent-text transition-colors hover:bg-accent-hover"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-1 flex-col bg-bg relative">
      {/* Floating Maximize Button */}
      {onToggleMaximize && (
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={onToggleMaximize}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-panel text-text-muted hover:bg-panel-hover hover:text-text-secondary transition-all border border-line"
            title={isMaximized ? 'Exit full view' : 'Full view'}
          >
            {isMaximized ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </div>
      )}

      {/* Content */}
      <div className="relative flex-1 flex flex-col overflow-hidden bg-bg min-h-0" style={{ userSelect: 'text' }}>
        {isLoading && !loadError && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/50">
            <div className="text-center rounded-xl bg-panel p-4 border border-line">
              <div className="mb-3 mx-auto h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent"></div>
              <p className="text-xs text-text-muted">Loading preview...</p>
            </div>
          </div>
        )}

        {loadError && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/80 p-8">
            <div className="max-w-sm text-center rounded-xl bg-panel p-6 border border-line">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-yellow-500" />
              <h3 className="mb-2 text-sm font-medium text-text-primary">
                {loadError === 'unreachable' ? (remote ? 'Broker unreachable' : 'Daemon unreachable')
                  : loadError === 'not-found' ? 'Artifact not found'
                  : loadError === 'offline-upstream' ? 'Remote offline' : 'Preview timed out'}
              </h3>
              <p className="mb-4 text-xs text-text-muted">
                {loadError === 'unreachable'
                  ? (remote
                    ? 'The broker is not responding.'
                    : 'The dashboard server is not responding. Bring it back with `artifact start`.')
                  : loadError === 'not-found'
                    ? 'This artifact is no longer on the remote.'
                    : loadError === 'offline-upstream'
                      ? 'The remote went offline. Its catalog is retained; preview resumes when it returns.'
                      : 'The artifact took too long to load.'}
              </p>
              <button
                onClick={retry}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-accent-text transition-colors hover:bg-accent-hover"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={previewSrc ?? undefined}
          sandbox="allow-scripts allow-same-origin allow-popups"
          className={`h-full w-full border-0 transition-opacity duration-300 ${isLoading && !loadError ? 'opacity-0' : 'opacity-100'}`}
          title={artifact.title}
          onLoad={reveal}
          onError={() => {
            clearTimer();
            setIsLoading(false);
            setLoadError((e) => e ?? 'unreachable');
          }}
        />
      </div>
    </div>
  );
}

/** Local SSE subscription; skipped in broker mode (qualified URL above). */
function useArtifactEventsLocal(enabled: boolean, slug: string | null, onEvent: () => void) {
  const cb = useRef(onEvent);
  cb.current = onEvent;
  useArtifactEvents({
    enabled,
    filter: (event) => !!slug && event.slug === slug,
    onEvent: () => {
      cb.current();
    },
  });
}
