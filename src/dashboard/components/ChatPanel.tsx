import { useState } from 'react';
import { useChatContext } from '../contexts/ChatContextPi.js';
import { ChatMessage } from './ChatMessagePi.js';
import { ChatComposer } from './ChatComposer.js';
import { ModelSelector } from './ModelSelector.js';

export function ChatPanel() {
  const {
    currentArtifact: artifact,
    sessionId,
    sessionLoading,
    sessionError,
    retrySession,
    messages,
    sendMessage,
    isStreaming,
    closeChat,
    models,
    selectedModel,
    setSelectedModel,
    defaultModel,
    saveDefaultModel,
  } = useChatContext();

  const [input, setInput] = useState('');

  if (!artifact) {
    return (
      <div className="flex h-full flex-col items-center justify-center border-l border-line bg-panel p-6 text-center">
        <div className="mb-3 text-2xl text-text-faint">💬</div>
        <h3 className="mb-1 text-sm font-medium text-text-secondary">No artifact selected</h3>
        <p className="text-xs text-text-muted">Select an artifact to start chatting</p>
      </div>
    );
  }

  if (sessionLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center border-l border-line bg-panel p-6 text-center">
        <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
        <p className="text-xs text-text-muted">Creating session...</p>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="flex h-full flex-col items-center justify-center border-l border-line bg-panel p-6 text-center">
        <div className="mb-3 text-2xl">⚠️</div>
        <h3 className="mb-1 text-sm font-medium text-text-secondary">Session Error</h3>
        <p className="mb-4 text-xs text-text-muted">{sessionError}</p>
        <button
          onClick={retrySession}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-l border-line bg-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-text-primary">Chat</h3>
          <p className="truncate text-xs text-text-muted" title={sessionId ?? undefined}>
            {artifact.title}
            {sessionId && (
              <span className="ml-2 text-text-faint">#{sessionId.slice(0, 8)}</span>
            )}
          </p>
        </div>
        {models.length > 0 && (
          <div className="ml-2">
            <ModelSelector
              models={models}
              selectedModel={selectedModel}
              defaultModel={defaultModel}
              onSelect={setSelectedModel}
              onSetDefault={saveDefaultModel}
            />
          </div>
        )}
        <button
          onClick={closeChat}
          className="ml-2 flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-panel-hover hover:text-text-secondary transition-colors"
          title="Close chat"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-xs text-text-muted">
              Ask about this artifact or request changes
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex items-center gap-2 py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
            <span className="text-xs text-text-muted">Thinking...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <ChatComposer
        value={input}
        onChange={setInput}
        onSubmit={sendMessage}
        disabled={isStreaming}
        placeholder={`Ask about ${artifact.slug}...`}
      />
    </div>
  );
}
