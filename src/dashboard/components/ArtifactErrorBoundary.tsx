import { Component, type ErrorInfo, type ReactNode } from 'react';
import { CopyButton } from './CopyButton.js';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ArtifactErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ArtifactErrorBoundary]', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <DefaultErrorView error={this.state.error} onReset={this.reset} />;
    }

    return this.props.children;
  }
}

function DefaultErrorView({
  error,
  onReset,
}: {
  error: Error | null;
  onReset: () => void;
}) {
  const errorMessage = error?.message || 'An error occurred while rendering this artifact';
  const errorStack = error?.stack || '';

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 rounded-full bg-red-900/20 p-4">
        <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h3 className="mb-2 text-lg font-medium text-red-400">
        Artifact Error
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
        onClick={onReset}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
      >
        Try Again
      </button>
    </div>
  );
}
