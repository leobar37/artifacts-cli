import { useState, useRef, useEffect } from "react";
import type { Artifact } from "../types/artifact.js";
import { useArtifacts } from "./hooks/useArtifacts.js";
import { useSelectedArtifact } from "./hooks/useSelectedArtifact.js";
import { useProject } from "./hooks/useProject.js";
import { ChatProvider, useChatContext } from "./contexts/ChatContextPi.js";
import { Header } from "./components/Header.js";
import { ArtifactList } from "./components/ArtifactList.js";
import { ArtifactViewer } from "./components/ArtifactViewer.js";
import { ChatPanel } from "./components/ChatPanel.js";
import {
  ChevronRight,
  ChevronLeft,
  MessageSquare,
  X,
  AlertCircle,
} from "lucide-react";

type ArtifactType = "generic" | "study" | "wireframe";

function App() {
  return (
    <ChatProvider>
      <AppContent />
    </ChatProvider>
  );
}

function AppContent() {
  const [selectedType, setSelectedType] = useState<ArtifactType | "all">("all");
  const { artifacts, total, loading, error, refetch } = useArtifacts({
    type: selectedType,
  });
  const { selectedArtifact, selectArtifact } = useSelectedArtifact();
  const { name: projectName } = useProject();
  const { setCurrentArtifact, isOpen: chatOpen, openChat } = useChatContext();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewerMaximized, setViewerMaximized] = useState(false);
  const [chatWidth, setChatWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(400);

  const handleSelectArtifact = (artifact: Artifact | null) => {
    selectArtifact(artifact);
    setCurrentArtifact(artifact);
  };

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-8 text-center bg-bg">
        <AlertCircle className="mb-4 h-12 w-12 text-text-muted" />
        <h2 className="mb-2 text-xl font-medium text-text-primary">
          Failed to load artifacts
        </h2>
        <p className="mb-6 max-w-md text-sm text-text-muted">{error.message}</p>
        <button
          onClick={refetch}
          className="rounded-lg bg-accent px-6 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          Try Again
        </button>
      </div>
    );
  }

  const effectiveSidebarCollapsed = sidebarCollapsed || viewerMaximized;

  const handleResizeStart = (e: React.MouseEvent) => {
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = chatWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = resizeStartX.current - e.clientX;
      const newWidth = Math.max(320, Math.min(600, resizeStartWidth.current + delta));
      setChatWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div className="flex h-screen flex-col bg-bg font-sans">
      {!viewerMaximized && (
        <Header
          total={total}
          onRefresh={refetch}
          isLoading={loading}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          selectedType={selectedType}
          onSelectType={setSelectedType}
          projectName={projectName}
        />
      )}

      <div
        className={`flex ${viewerMaximized ? "h-screen" : "flex-1"} overflow-hidden relative`}
      >
        {/* Sidebar */}
        <aside
          className={`
            border-r border-line bg-panel transition-all duration-300 ease-in-out z-10
            ${effectiveSidebarCollapsed ? "w-0 overflow-hidden opacity-0" : "w-full md:w-80 lg:w-96 opacity-100"}
          `}
        >
          {loading && artifacts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
              <p className="text-sm text-text-muted">
                Loading artifacts...
              </p>
            </div>
          ) : (
            <ArtifactList
              artifacts={artifacts}
              selectedSlug={selectedArtifact?.slug || null}
              onSelect={handleSelectArtifact}
            />
          )}
        </aside>

        {/* Sidebar Toggle */}
        {!viewerMaximized && (
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`
              hidden md:flex items-center justify-center absolute left-0 top-1/2 -translate-y-1/2 -ml-3 z-20
              h-8 w-6 bg-panel border border-line rounded-r-md
              text-text-muted hover:text-text-secondary transition-colors
              ${!effectiveSidebarCollapsed ? "left-80 lg:left-96 ml-0 rounded-l-md border-l-0" : "rounded-l-none border-l-0"}
            `}
            title={effectiveSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              transform: effectiveSidebarCollapsed
                ? "translateY(-50%)"
                : "translate(-100%, -50%)",
            }}
          >
            {effectiveSidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        )}

        {/* Main + Chat Panel */}
        <div className="hidden flex-1 md:flex relative z-0 overflow-hidden">
          {/* Viewer */}
          <div className="flex-1 min-w-0">
            <ArtifactViewer
              artifact={selectedArtifact}
              isMaximized={viewerMaximized}
              onToggleMaximize={() => setViewerMaximized(!viewerMaximized)}
            />
          </div>

          {/* Chat Panel */}
          {chatOpen && (
            <>
              {/* Resize Handle */}
              <div
                onMouseDown={handleResizeStart}
                className="flex-shrink-0 w-1 bg-line hover:bg-accent cursor-col-resize transition-colors relative"
              />
              {/* Chat */}
              <div
                className="flex-shrink-0 flex flex-col border-l border-line bg-panel"
                style={{ width: `${chatWidth}px`, minWidth: '320px', maxWidth: '600px' }}
              >
                <ChatPanel />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chat toggle button */}
      {!chatOpen && (
        <button
          onClick={openChat}
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-text transition-all hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/30 hover:-translate-y-0.5"
          title="Open chat"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      )}

      {/* Mobile viewer */}
      {selectedArtifact && (
        <div className="fixed inset-0 z-50 bg-bg/95 backdrop-blur-md md:hidden">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-3">
              <h2 className="truncate text-sm font-medium text-text-primary">
                {selectedArtifact.title}
              </h2>
              <button
                onClick={() => handleSelectArtifact(null)}
                className="rounded-lg p-2 text-text-muted hover:bg-panel-hover hover:text-text-primary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ArtifactViewer artifact={selectedArtifact} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
