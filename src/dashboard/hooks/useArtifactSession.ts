import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('useArtifactSession');

import type { UIMessage } from 'ai';

interface UseArtifactSessionResult {
  sessionId: string | null;
  loading: boolean;
  error: string | null;
  clearSession: () => void;
  retrySession: () => void;
  hasStoredSession: boolean;
  resumeSession: () => void;
  startNewSession: () => void;
  messages: UIMessage[];
  sessionModel: string | null;
}

// Generate a project-specific key for localStorage
function getStorageKey(slug: string): string {
  // Use hostname + pathname to create a unique project identifier
  const projectKey = `${window.location.hostname}_${window.location.pathname}`;
  return `artifact-session:${projectKey}:${slug}`;
}

function getStoredSessionId(slug: string): string | null {
  try {
    const key = getStorageKey(slug);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStoredSessionId(slug: string, sessionId: string): void {
  try {
    const key = getStorageKey(slug);
    localStorage.setItem(key, sessionId);
  } catch (err) {
    log.warn('Failed to store session ID:', err);
  }
}

function clearStoredSessionId(slug: string): void {
  try {
    const key = getStorageKey(slug);
    localStorage.removeItem(key);
  } catch {
    // Ignore errors
  }
}

async function validateSession(slug: string, sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/chat/sessions?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return false;

    const { sessions } = await res.json();
    return sessions.some((s: { id: string }) => s.id === sessionId);
  } catch {
    return false;
  }
}

export function useArtifactSession(slug: string | null): UseArtifactSessionResult {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStoredSession, setHasStoredSession] = useState(false);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [sessionModel, setSessionModel] = useState<string | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 2;

  // Check for stored session on mount
  useEffect(() => {
    log.info('Mount effect triggered', { slug, sessionId, loading, error });
    if (!slug) {
      setHasStoredSession(false);
      return;
    }

    const storedId = getStoredSessionId(slug);
    log.info('Stored session ID:', storedId ? `${storedId.slice(0, 8)}...` : null);
    if (storedId) {
      setHasStoredSession(true);
    }
  }, [slug]);

  const createNewSession = useCallback(async () => {
    log.info('Creating new session for slug:', slug);
    if (!slug) return;

    setLoading(true);
    setError(null);
    setHasStoredSession(false);
    setMessages([]);

    try {
      const res = await fetch('/api/chat/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });

      if (!res.ok) {
        throw new Error(`Failed to create session: ${res.status}`);
      }

      const { sessionId: newSessionId, model } = await res.json();
      log.info('New session created:', newSessionId.slice(0, 8) + '...', 'model:', model);
      setSessionId(newSessionId);
      setSessionModel(model || null);
      setStoredSessionId(slug, newSessionId);
      retryCountRef.current = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log.error('Failed to create session:', message);
      setError(message);
      setSessionId(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const resumeSession = useCallback(async () => {
    if (!slug) return;

    const storedId = getStoredSessionId(slug);
    if (!storedId) {
      // No stored session, create new
      createNewSession();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Validate the stored session still exists on server
      const isValid = await validateSession(slug, storedId);

      if (isValid) {
        // Resume the session
        const res = await fetch('/api/chat/resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: storedId, slug }),
        });

        if (res.ok) {
          const data = await res.json();
          setSessionId(storedId);
          setHasStoredSession(false);
          setSessionModel(data.model || null);
          if (data.messages && Array.isArray(data.messages)) {
            setMessages(data.messages);
          }
          log.info(`Resumed session ${storedId.slice(0, 8)}... with ${data.messages?.length || 0} messages, model: ${data.model}`);
        } else {
          // Session no longer valid, clear and create new
          clearStoredSessionId(slug);
          await createNewSession();
        }
      } else {
        // Session not found, clear and create new
        clearStoredSessionId(slug);
        await createNewSession();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setSessionId(null);
    } finally {
      setLoading(false);
    }
  }, [slug, createNewSession]);

  const startNewSession = useCallback(() => {
    if (!slug) return;
    clearStoredSessionId(slug);
    setHasStoredSession(false);
    setMessages([]);
    createNewSession();
  }, [slug, createNewSession]);

  // Auto-resume if there's a stored session and no current session
  useEffect(() => {
    if (!slug || sessionId) return;

    const storedId = getStoredSessionId(slug);
    if (storedId && !sessionId && !loading && !error) {
      // Auto-resume after a short delay to allow UI to settle
      const timer = setTimeout(() => {
        resumeSession();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [slug, sessionId, loading, error, resumeSession]);

  const retrySession = useCallback(() => {
    if (retryCountRef.current < maxRetries) {
      retryCountRef.current++;
      log.info(`Retrying session creation (attempt ${retryCountRef.current}/${maxRetries})`);
      createNewSession();
    } else {
      setError('Failed to create session after multiple attempts. Please refresh the page.');
    }
  }, [createNewSession]);

  const clearSession = useCallback(() => {
    if (sessionId && slug) {
      fetch(`/api/chat/session/${sessionId}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
    if (slug) {
      clearStoredSessionId(slug);
    }
    setSessionId(null);
    setError(null);
    setHasStoredSession(false);
    setMessages([]);
    setSessionModel(null);
    retryCountRef.current = 0;
  }, [sessionId, slug]);

  return {
    sessionId,
    loading,
    error,
    clearSession,
    retrySession,
    hasStoredSession,
    resumeSession,
    startNewSession,
    messages,
    sessionModel,
  };
}
