import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { MarkdownMessage } from './MarkdownMessage.js';
import type { ChatMessage } from '../hooks/usePiChat.js';

interface ChatMessageProps {
  message: ChatMessage;
}

function ReasoningBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 rounded-xl border border-line bg-panel overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-panel-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-text-muted">Thinking</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-faint">
            {expanded ? 'Hide' : 'Show'}
          </span>
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-text-faint" />
          ) : (
            <ChevronRight className="h-3 w-3 text-text-faint" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-line p-3">
          <pre className="text-[11px] font-mono text-text-muted whitespace-pre-wrap">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}

function ToolCallBlock({ tool }: { tool: NonNullable<ChatMessage['toolCalls']>[number] }) {
  const [expanded, setExpanded] = useState(true);

  let icon: React.ReactNode = null;
  switch (tool.status) {
    case 'pending':
      icon = <Loader2 className="h-3 w-3 animate-spin text-text-muted" />;
      break;
    case 'running':
      icon = <Loader2 className="h-3 w-3 animate-spin text-accent" />;
      break;
    case 'completed':
      icon = <CheckCircle className="h-3 w-3 text-green-500" />;
      break;
    case 'error':
      icon = <XCircle className="h-3 w-3 text-red-500" />;
      break;
  }

  return (
    <div className="mt-2 rounded-xl border border-line bg-panel overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-panel-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          <Wrench className="h-3 w-3 text-text-muted" />
          <span className="text-[10px] font-medium text-text-muted">{tool.toolName}</span>
          <span className="text-[10px] text-text-faint">({tool.toolCallId.slice(0, 8)}...)</span>
        </div>
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[10px] text-text-faint">
            {expanded ? 'Hide' : 'Show'}
          </span>
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-text-faint" />
          ) : (
            <ChevronRight className="h-3 w-3 text-text-faint" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-line p-3 space-y-2">
          {tool.args !== undefined && tool.args !== null && (
            <div>
              <span className="text-[10px] font-medium text-text-muted">Input:</span>
              <pre className="mt-1 text-[10px] font-mono text-text-muted whitespace-pre-wrap bg-bg p-2 rounded">
                {JSON.stringify(tool.args, null, 2)}
              </pre>
            </div>
          )}
          {tool.result !== undefined && (
            <div>
              <span className="text-[10px] font-medium text-text-muted">Result:</span>
              <pre className={`mt-1 text-[10px] font-mono whitespace-pre-wrap p-2 rounded ${tool.isError ? 'text-red-400 bg-red-500/10' : 'text-text-muted bg-bg'}`}>
                {typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  const messageClasses = isUser
    ? 'bg-user-msg-bg text-user-msg-text'
    : 'bg-assistant-msg-bg text-assistant-msg-text border border-line';

  return (
    <div className={isUser ? 'flex justify-end mb-3' : 'flex justify-start mb-3'}>
      <div
        className={['max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed', messageClasses].join(' ')}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <div>
            {message.content && <MarkdownMessage content={message.content} />}
            {message.reasoning && <ReasoningBlock text={message.reasoning} />}
            {message.toolCalls?.map((tool) => (
              <ToolCallBlock key={tool.toolCallId} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
