import { Suspense } from 'react';
import { useDynamicArtifact } from '../hooks/useDynamicArtifact.js';
import { ArtifactErrorBoundary } from './ArtifactErrorBoundary.js';
import { CopyButton } from './CopyButton.js';

interface ArtifactRendererProps {
  slug: string;
  version?: number;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="mb-2 inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-blue-500"></div>
        <p className="text-sm text-slate-500">Loading React artifact...</p>
      </div>
    </div>
  );
}

function ErrorView({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const errorMessage = error?.message || 'Failed to load this artifact';
  const errorStack = error?.stack || '';

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 rounded-full bg-red-900/20 p-4">
        <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h3 className="mb-2 text-lg font-medium text-red-400">
        Loading Error
      </h3>
      <div className="mb-4 max-w-lg w-full rounded-lg bg-slate-900/80 border border-slate-800 p-3 text-left">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Error</span>
          <CopyButton text={errorStack ? `${errorMessage}\n\n${errorStack}` : errorMessage} />
        </div>
        <p className="text-sm text-red-300/80 break-all font-mono leading-relaxed">
          {errorMessage}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
      >
        Retry
      </button>
    </div>
  );
}

export function ArtifactRenderer({ slug, version, fallback, onError }: ArtifactRendererProps) {
  const { Component, error, loading, retry } = useDynamicArtifact(slug, { version });

  if (loading) {
    return fallback || <LoadingState />;
  }

  if (error) {
    return <ErrorView error={error} onRetry={retry} />;
  }

  if (!Component) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="text-sm text-slate-500">Artifact not found</p>
      </div>
    );
  }

  return (
    <Suspense fallback={fallback || <LoadingState />}>
      <ArtifactErrorBoundary onError={onError}>
        <div className="h-full w-full flex flex-col flex-1 relative" style={{ userSelect: 'text', cursor: 'text' }}>
          <div className="h-full w-full flex-1 min-h-0 min-w-0">
            <Component />
          </div>
        </div>
      </ArtifactErrorBoundary>
    </Suspense>
  );
}
