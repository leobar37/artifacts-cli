import { CheckCircle, XCircle, Loader2, AlertTriangle, Clock, ChevronDown, ChevronRight, FileEdit, FileText, Terminal, Search } from 'lucide-react';
import { useState } from 'react';
import { formatJson, truncateJson, getToolStateLabel } from '../../utils/chat/tools.js';

interface ToolPartProps {
  toolName: string;
  toolCallId: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

function getToolIcon(kind?: string, state?: string) {
  if (state === 'call' || state === 'partial-call' || state === 'input-streaming') {
    return <Loader2 className="h-3 w-3 animate-spin text-accent" />;
  }
  
  switch (kind) {
    case 'edit':
      return <FileEdit className="h-3 w-3 text-text-muted" />;
    case 'read':
      return <FileText className="h-3 w-3 text-text-muted" />;
    case 'execute':
      return <Terminal className="h-3 w-3 text-text-muted" />;
    case 'search':
      return <Search className="h-3 w-3 text-text-muted" />;
    default:
      return getStateIcon(state || 'call');
  }
}

function getStateIcon(state: string) {
  switch (state) {
    case 'input-streaming':
    case 'call':
    case 'partial-call':
      return <Loader2 className="h-3 w-3 animate-spin text-accent" />;
    case 'input-available':
      return <Clock className="h-3 w-3 text-text-muted" />;
    case 'output-available':
    case 'result':
      return <CheckCircle className="h-3 w-3 text-text-muted" />;
    case 'output-error':
      return <XCircle className="h-3 w-3 text-text-muted" />;
    case 'approval-requested':
      return <AlertTriangle className="h-3 w-3 text-text-muted" />;
    default:
      return <Clock className="h-3 w-3 text-text-faint" />;
  }
}

interface DiffViewProps {
  diff?: {
    path: string;
    oldText: string;
    newText: string;
  };
  rawOutput?: Record<string, unknown>;
}

function DiffView({ diff, rawOutput }: DiffViewProps) {
  if (!diff && !rawOutput) return null;

  const metadata = rawOutput?.metadata as Record<string, unknown> | undefined;
  const diffText = diff 
    ? `${diff.oldText}\n→\n${diff.newText}`
    : (metadata?.diff as string | undefined);

  return (
    <div className="mt-2 space-y-2">
      {diff?.path && (
        <p className="text-[10px] text-text-faint font-mono truncate">
          {diff.path}
        </p>
      )}
      {diffText && (
        <div className="rounded-xl bg-panel-raised border border-line overflow-hidden">
          <pre className="text-[10px] font-mono whitespace-pre-wrap p-2 overflow-x-auto text-text-muted">
            {diffText}
          </pre>
        </div>
      )}
    </div>
  );
}

function ToolCard({ toolName, state, kind, children }: { toolName: string; state: string; kind?: string; children?: React.ReactNode }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="mt-2 rounded-xl border border-line bg-panel overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-panel-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          {getToolIcon(kind, state)}
          <span className="text-xs font-medium text-text-secondary">{toolName}</span>
          {kind && kind !== 'other' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-panel-raised text-text-muted capitalize">
              {kind}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-faint">{getToolStateLabel(state)}</span>
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-text-faint" />
          ) : (
            <ChevronRight className="h-3 w-3 text-text-faint" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-line p-3">{children}</div>
      )}
    </div>
  );
}

export function ChatToolPart(props: ToolPartProps) {
  const { toolName, state = 'call', input, output, errorText } = props;

  let kind: string | undefined;
  let locations: Array<{path?: string}> | undefined;
  let diff: {path: string; oldText: string; newText: string} | undefined;
  let rawOutput: Record<string, unknown> | undefined;
  let rawInput: Record<string, unknown> | undefined;
  let outputText: string | undefined;

  if (output && typeof output === 'object') {
    const enriched = output as Record<string, unknown>;
    kind = enriched.kind as string | undefined;
    locations = enriched.locations as Array<{path?: string}> | undefined;
    diff = enriched.diff as typeof diff | undefined;
    rawOutput = enriched.rawOutput as Record<string, unknown> | undefined;
    rawInput = enriched.rawInput as Record<string, unknown> | undefined;
    outputText = enriched.output as string | undefined;
  }

  switch (state) {
    case 'input-streaming': {
      const formatted = input ? truncateJson(formatJson(input)) : '';
      return (
        <ToolCard toolName={toolName} state={state} kind={kind}>
          {formatted ? (
            <pre className="text-[10px] font-mono text-text-muted whitespace-pre-wrap break-all">
              {formatted}
            </pre>
          ) : (
            <p className="text-[10px] text-text-faint italic">Streaming input...</p>
          )}
        </ToolCard>
      );
    }

    case 'input-available': {
      const formatted = input ? truncateJson(formatJson(input)) : '';
      return (
        <ToolCard toolName={toolName} state={state} kind={kind}>
          {formatted ? (
            <>
              <p className="text-[10px] font-medium text-text-muted mb-1">Input:</p>
              <pre className="text-[10px] font-mono text-text-secondary whitespace-pre-wrap break-all bg-panel-raised rounded-lg p-2">
                {formatted}
              </pre>
            </>
          ) : (
            <p className="text-[10px] text-text-faint italic">No input</p>
          )}
        </ToolCard>
      );
    }

    case 'output-available':
    case 'result': {
      const hasInput = Boolean(rawInput || input);
      const hasOutput = Boolean(outputText || (output && typeof output === 'string'));
      const hasDiff = kind === 'edit' && Boolean(diff || rawOutput);

      return (
        <ToolCard toolName={toolName} state={state} kind={kind}>
          {locations && locations.length > 0 && (
            <div className="mb-2">
              {locations.map((loc, i) => (
                <p key={i} className="text-[10px] text-text-faint font-mono truncate">
                  📁 {loc.path}
                </p>
              ))}
            </div>
          )}
          
          {hasInput && (
            <div className="mb-2">
              <p className="text-[10px] font-medium text-text-muted mb-1">Parameters:</p>
              <pre className="text-[10px] font-mono text-text-secondary whitespace-pre-wrap break-all bg-panel-raised rounded-lg p-2">
                {truncateJson(formatJson(rawInput || input))}
              </pre>
            </div>
          )}
          
          {hasDiff && (
            <DiffView diff={diff} rawOutput={rawOutput} />
          )}
          
          {hasOutput && !hasDiff && (
            <div className="mt-2">
              <p className="text-[10px] font-medium text-text-muted mb-1">Result:</p>
              <pre className="text-[10px] font-mono text-text-secondary whitespace-pre-wrap break-all bg-panel-raised rounded-lg p-2">
                {outputText || (output ? String(output) : '')}
              </pre>
            </div>
          )}
          
          {!hasInput && !hasOutput && !hasDiff && (
            <p className="text-[10px] text-text-faint italic">Completed</p>
          )}
        </ToolCard>
      );
    }

    case 'output-error': {
      return (
        <ToolCard toolName={toolName} state={state} kind={kind}>
          <p className="text-[10px] font-medium text-text-secondary mb-1">Error:</p>
          <p className="text-[10px] text-text-muted">
            {errorText || 'An error occurred during tool execution'}
          </p>
        </ToolCard>
      );
    }

    case 'approval-requested': {
      const formatted = input ? truncateJson(formatJson(input)) : '';
      return (
        <ToolCard toolName={toolName} state={state} kind={kind}>
          {formatted && (
            <>
              <p className="text-[10px] font-medium text-text-muted mb-1">Requested action:</p>
              <pre className="text-[10px] font-mono text-text-secondary whitespace-pre-wrap break-all bg-panel-raised rounded-lg p-2 mb-2">
                {formatted}
              </pre>
            </>
          )}
          <p className="text-[10px] text-text-muted italic">Waiting for approval...</p>
        </ToolCard>
      );
    }

    default: {
      return (
        <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
          {getToolIcon(kind, state)}
          <span>{toolName}</span>
        </div>
      );
    }
  }
}
