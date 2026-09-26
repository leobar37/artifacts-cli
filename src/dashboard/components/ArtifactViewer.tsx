import { useState, useEffect, useRef, useCallback } from 'react';
import type { Artifact } from '../../types/artifact.js';
import { useArtifactEvents } from '../hooks/useArtifactEvents.js';
import { projectBase } from '../lib/project.js';
import { Maximize2, Minimize2, Box, AlertTriangle, RefreshCw } from 'lucide-react';

interface ArtifactViewerProps {
  artifact: Artifact | null;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

const LOAD_TIMEOUT_MS = 15000;

type LoadError = 'unreachable' | 'timeout' | null;

async function isDaemonReachable(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    return res.ok;
  } catch {
    return false;
  }
}

export function ArtifactViewer({ artifact, isMaximized, onToggleMaximize }: ArtifactViewerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<LoadError>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRetriedRef = useRef(false);

  const stretchHtmlArtifact = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

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
  };

  const [refreshKey, setRefreshKey] = useState(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleTimeout = useCallback(async () => {
    if (!(await isDaemonReachable())) {
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

  const startLoading = useCallback(() => {
    clearTimer();
    autoRetriedRef.current = false;
    setLoadError(null);
    setIsLoading(true);
    timerRef.current = setTimeout(() => void handleTimeout(), LOAD_TIMEOUT_MS);
  }, [clearTimer, handleTimeout]);

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

  useArtifactEvents({
    filter: (event) => !!artifact && event.slug === artifact.slug,
    onEvent: reloadArtifact,
  });

  useEffect(() => {
    startLoading();
    return clearTimer;
  }, [artifact?.slug, startLoading, clearTimer]);

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
                {loadError === 'unreachable' ? 'Daemon unreachable' : 'Preview timed out'}
              </h3>
              <p className="mb-4 text-xs text-text-muted">
                {loadError === 'unreachable'
                  ? 'The dashboard server is not responding. Bring it back with `artifact start`.'
                  : 'The artifact took too long to load. Check `artifact logs` if it keeps happening.'}
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
          src={`${projectBase()}/artifacts/${artifact.slug}/index.html?v=${refreshKey}`}
          sandbox="allow-scripts allow-same-origin allow-popups"
          className={`h-full w-full border-0 transition-opacity duration-300 ${isLoading && !loadError ? 'opacity-0' : 'opacity-100'}`}
          title={artifact.title}
          onLoad={() => {
            clearTimer();
            stretchHtmlArtifact();
            setIsLoading(false);
          }}
          onError={() => {
            clearTimer();
            setIsLoading(false);
          }}
        />
      </div>
    </div>
  );
}
