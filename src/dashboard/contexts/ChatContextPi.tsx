import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react';
import type { Artifact } from '../../types/artifact.js';
import { useArtifactSession } from '../hooks/useArtifactSession.js';
import { usePiChat, type ChatMessage } from '../hooks/usePiChat.js';

export type ChatStatus = 'idle' | 'streaming' | 'submitted' | 'error';

export interface ModelEntry {
  id: string;
  providerId: string;
  modelId: string;
}

interface ProjectConfig {
  defaultModel?: string | null;
}

interface ChatContextValue {
  // Artifact binding
  currentArtifact: Artifact | null;
  setCurrentArtifact: (artifact: Artifact | null) => void;

  // Session
  sessionId: string | null;
  sessionLoading: boolean;
  sessionError: string | null;
  retrySession: () => void;
  clearSession: () => void;
  startNewSession: () => void;
  sessionModel: string | null;

  // Chat
  messages: ChatMessage[];
  sendMessage: (text: string) => void;
  status: ChatStatus;
  isStreaming: boolean;
  chatError: string | null;
  clearChat: () => void;

  // Models
  models: ModelEntry[];
  selectedModel: string | null;
  setSelectedModel: (model: string | null) => void;
  defaultModel: string | null;
  saveDefaultModel: (modelId: string | null) => Promise<void>;

  // UI
  isOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [currentArtifact, setCurrentArtifact] = useState<Artifact | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);

  const {
    sessionId,
    loading: sessionLoading,
    error: sessionError,
    retrySession,
    clearSession,
    startNewSession,
    sessionModel,
  } = useArtifactSession(currentArtifact?.slug ?? null);

  // Use Pi Chat hook instead of AI SDK's useChat
  const {
    messages,
    sendMessage: sendPiMessage,
    status,
    isStreaming,
    error: chatError,
    clearMessages: clearChat,
  } = usePiChat({
    sessionId,
    slug: currentArtifact?.slug ?? null,
    model: selectedModel,
  });

  const openChat = useCallback(() => setIsOpen(true), []);
  const closeChat = useCallback(() => setIsOpen(false), []);

  // Load models and project config on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/chat/models')
        .then((r) => r.json())
        .then((data: { models: ModelEntry[] }) => setModels(data.models))
        .catch(() => {}),
      fetch('/api/project/config')
        .then((r) => r.json())
        .then((config: ProjectConfig) => {
          if (config.defaultModel) {
            setDefaultModel(config.defaultModel);
            setSelectedModel(config.defaultModel);
          }
        })
        .catch(() => {}),
    ]);
  }, []);

  const saveDefaultModel = useCallback(async (modelId: string | null) => {
    try {
      const response = await fetch('/api/project/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultModel: modelId }),
      });
      if (response.ok) {
        setDefaultModel(modelId);
      }
    } catch {
      // Silently fail
    }
  }, []);

  const handleSendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isStreaming) return;
      sendPiMessage(text.trim());
    },
    [sendPiMessage, isStreaming],
  );

  const handleSetCurrentArtifact = useCallback(
    (artifact: Artifact | null) => {
      setCurrentArtifact(artifact);
    },
    [],
  );

  // Auto-open chat when artifact selected
  useEffect(() => {
    if (currentArtifact && !isOpen) {
      setIsOpen(true);
    }
  }, [currentArtifact]);

  // Sync selected model with session model when detected
  useEffect(() => {
    if (sessionModel) {
      setSelectedModel(sessionModel);
    }
  }, [sessionModel]);

  const value = useMemo<ChatContextValue>(
    () => ({
      currentArtifact,
      setCurrentArtifact: handleSetCurrentArtifact,
      sessionId,
      sessionLoading,
      sessionError,
      retrySession,
      clearSession,
      startNewSession,
      sessionModel,
      messages,
      sendMessage: handleSendMessage,
      status,
      isStreaming,
      chatError,
      clearChat,
      models,
      selectedModel,
      setSelectedModel,
      defaultModel,
      saveDefaultModel,
      isOpen,
      openChat,
      closeChat,
    }),
    [
      currentArtifact,
      handleSetCurrentArtifact,
      sessionId,
      sessionLoading,
      sessionError,
      retrySession,
      clearSession,
      startNewSession,
      sessionModel,
      messages,
      handleSendMessage,
      status,
      isStreaming,
      chatError,
      clearChat,
      models,
      selectedModel,
      defaultModel,
      saveDefaultModel,
      isOpen,
      openChat,
      closeChat,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChatContext must be used within a <ChatProvider>');
  }
  return ctx;
}
