import { useState, useCallback, useRef, useEffect } from 'react';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('usePiChat');

export type ChatStatus = 'idle' | 'streaming' | 'submitted' | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
  toolCalls?: Array<{
    toolCallId: string;
    toolName: string;
    args: unknown;
    result?: unknown;
    isError?: boolean;
    status: 'pending' | 'running' | 'completed' | 'error';
  }>;
  reasoning?: string;
}

export interface UsePiChatResult {
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
  status: ChatStatus;
  isStreaming: boolean;
  error: string | null;
  clearMessages: () => void;
}

export interface UsePiChatOptions {
  sessionId: string | null;
  slug: string | null;
  model: string | null;
  onEvent?: (event: { type: string; payload: Record<string, unknown> }) => void;
}

export function usePiChat(options: UsePiChatOptions): UsePiChatResult {
  const { sessionId, slug, model } = options;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const statusRef = useRef(status);
  statusRef.current = status;

  const eventSourceRef = useRef<EventSource | null>(null);
  const currentAssistantMessageRef = useRef<string>('');
  const currentReasoningRef = useRef<string>('');

  // Connect to SSE for session events
  useEffect(() => {
    if (!sessionId) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const es = new EventSource(`/api/chat/events/${sessionId}`);
    eventSourceRef.current = es;

    es.addEventListener('connected', (e) => {
      log.info('SSE connected:', e.data);
    });

    es.addEventListener('agent:start', () => {
      setStatus('streaming');
      setError(null);
    });

    es.addEventListener('agent:end', () => {
      setStatus('idle');
      currentAssistantMessageRef.current = '';
      currentReasoningRef.current = '';
    });

    es.addEventListener('chat:message:start', (e) => {
      try {
        const data = JSON.parse(e.data);
        const msg: ChatMessage = {
          id: data.messageId || crypto.randomUUID(),
          role: 'assistant',
          content: '',
          parts: [],
        };
        setMessages((prev) => [...prev, msg]);
      } catch (err) {
        log.warn('Failed to parse message_start:', err);
      }
    });

    es.addEventListener('chat:text:delta', (e) => {
      try {
        const data = JSON.parse(e.data);
        const delta = data.delta || '';
        currentAssistantMessageRef.current += delta;

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== 'assistant') return prev;
          const updated: ChatMessage = {
            ...last,
            content: currentAssistantMessageRef.current,
            parts: [{ type: 'text', text: currentAssistantMessageRef.current }],
          };
          return [...prev.slice(0, -1), updated];
        });
      } catch (err) {
        log.warn('Failed to parse text_delta:', err);
      }
    });

    es.addEventListener('chat:reasoning:start', () => {
      currentReasoningRef.current = '';
    });

    es.addEventListener('chat:reasoning:delta', (e) => {
      try {
        const data = JSON.parse(e.data);
        const delta = data.delta || '';
        currentReasoningRef.current += delta;

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== 'assistant') return prev;
          return [
            ...prev.slice(0, -1),
            { ...last, reasoning: currentReasoningRef.current },
          ];
        });
      } catch (err) {
        log.warn('Failed to parse reasoning_delta:', err);
      }
    });

    es.addEventListener('chat:reasoning:end', () => {
      // Reasoning complete
    });

    es.addEventListener('chat:tool:start', (e) => {
      try {
        const data = JSON.parse(e.data);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== 'assistant') return prev;
          const toolCalls = last.toolCalls || [];
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              toolCalls: [
                ...toolCalls,
                {
                  toolCallId: data.toolCallId,
                  toolName: data.toolName,
                  args: data.args,
                  status: 'running' as const,
                },
              ],
            },
          ];
        });
      } catch (err) {
        log.warn('Failed to parse tool_start:', err);
      }
    });

    es.addEventListener('chat:tool:update', (e) => {
      try {
        const data = JSON.parse(e.data);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || !last.toolCalls) return prev;
          const updatedTools = last.toolCalls.map((t) =>
            t.toolCallId === data.toolCallId
              ? { ...t, status: 'running' as const }
              : t
          );
          return [...prev.slice(0, -1), { ...last, toolCalls: updatedTools }];
        });
      } catch (err) {
        log.warn('Failed to parse tool_update:', err);
      }
    });

    es.addEventListener('chat:tool:end', (e) => {
      try {
        const data = JSON.parse(e.data);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || !last.toolCalls) return prev;
          const updatedTools = last.toolCalls.map((t) =>
            t.toolCallId === data.toolCallId
              ? {
                  ...t,
                  result: data.result,
                  isError: data.isError,
                  status: (data.isError ? 'error' : 'completed') as
                    | 'completed'
                    | 'error',
                }
              : t
          );
          return [...prev.slice(0, -1), { ...last, toolCalls: updatedTools }];
        });
      } catch (err) {
        log.warn('Failed to parse tool_end:', err);
      }
    });

    es.addEventListener('chat:error', (e) => {
      try {
        const data = JSON.parse(e.data);
        setError(data.message || 'Unknown error');
        setStatus('error');
      } catch {
        setError('Unknown error');
        setStatus('error');
      }
    });

    es.onerror = (err) => {
      log.warn('SSE error:', err);
      // Don't set error state on connection issues, try to reconnect
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [sessionId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !slug) return;
      if (statusRef.current === 'streaming' || statusRef.current === 'submitted') return;

      setStatus('submitted');
      setError(null);

      // Add user message immediately
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text.trim(),
        parts: [{ type: 'text', text: text.trim() }],
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            slug,
            model,
            messages: [...messagesRef.current, userMsg].map((m) => ({
              id: m.id,
              role: m.role,
              parts: m.parts,
            })),
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Request failed' }));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        // The response confirms the prompt was sent
        // Actual content comes via SSE
        setStatus('streaming');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send message';
        log.error('Send message failed:', message);
        setError(message);
        setStatus('error');
      }
    },
    [sessionId, slug, model]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStatus('idle');
    setError(null);
    currentAssistantMessageRef.current = '';
    currentReasoningRef.current = '';
  }, []);

  return {
    messages,
    sendMessage,
    status,
    isStreaming: status === 'streaming' || status === 'submitted',
    error,
    clearMessages,
  };
}
