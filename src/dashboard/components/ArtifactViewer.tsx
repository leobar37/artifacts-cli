import { useState, useEffect, useRef, useCallback } from 'react';
import type { Artifact } from '../../types/artifact.js';
import { ArtifactRenderer } from './ArtifactRenderer.js';
import { useArtifactEvents } from '../hooks/useArtifactEvents.js';
import { Maximize2, Minimize2, Box } from 'lucide-react';

interface ArtifactViewerProps {
  artifact: Artifact | null;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

function getArtifactFormat(artifact: Artifact): 'tsx' | 'html' {
  return artifact.format || 'html';
}

export function ArtifactViewer({ artifact, isMaximized, onToggleMaximize }: ArtifactViewerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

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
    setIsLoading(true);
  }, [artifact?.slug]);

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

  const format = getArtifactFormat(artifact);

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
        {isLoading && format === 'html' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/50">
            <div className="text-center rounded-xl bg-panel p-4 border border-line">
              <div className="mb-3 mx-auto h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent"></div>
              <p className="text-xs text-text-muted">Loading preview...</p>
            </div>
          </div>
        )}

        {format === 'tsx' ? (
          <ArtifactRenderer
            key={`${artifact.slug}-${refreshKey}`}
            slug={artifact.slug}
            version={refreshKey}
            fallback={
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="mb-3 mx-auto h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent"></div>
                  <p className="text-xs text-text-muted">Compiling React artifact...</p>
                </div>
              </div>
            }
          />
        ) : (
          <iframe
            ref={iframeRef}
            src={`/artifacts/${artifact.slug}/index.html?v=${refreshKey}`}
            sandbox="allow-scripts allow-same-origin allow-popups"
            className={`h-full w-full border-0 transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
            title={artifact.title}
            onLoad={() => {
              stretchHtmlArtifact();
              setIsLoading(false);
            }}
            onError={() => setIsLoading(false)}
          />
        )}
      </div>
    </div>
  );
}
