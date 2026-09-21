import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Search, Star, ChevronDown } from "lucide-react";

export interface ModelEntry {
  id: string;
  providerId: string;
  modelId: string;
}

interface ModelSelectorProps {
  models: ModelEntry[];
  selectedModel: string | null;
  defaultModel: string | null;
  onSelect: (modelId: string | null) => void;
  onSetDefault: (modelId: string | null) => void;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-accent/20 text-accent">{part}</mark>
    ) : (
      part
    ),
  );
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$\u0026");
}

export function ModelSelector({
  models,
  selectedModel,
  defaultModel,
  onSelect,
  onSetDefault,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredModels = useMemo(() => {
    if (!query) return models;
    const lowerQuery = query.toLowerCase();
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(lowerQuery) ||
        m.providerId.toLowerCase().includes(lowerQuery) ||
        m.modelId.toLowerCase().includes(lowerQuery),
    );
  }, [models, query]);

  const selectedEntry = models.find((m) => m.id === selectedModel);
  const isDefault = selectedModel === defaultModel;

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            Math.min(prev + 1, filteredModels.length - 1),
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredModels[highlightedIndex]) {
            onSelect(filteredModels[highlightedIndex].id);
            setIsOpen(false);
            setQuery("");
          }
          break;
        case "Escape":
          setIsOpen(false);
          setQuery("");
          break;
      }
    },
    [isOpen, filteredModels, highlightedIndex, onSelect],
  );

  const handleSelect = (modelId: string) => {
    onSelect(modelId);
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-line bg-panel-raised px-3 py-1.5 text-xs text-text-secondary hover:border-line hover:bg-panel-hover transition-colors"
        title={selectedEntry?.id || "Select model"}
      >
        <span className="max-w-[140px] truncate">
          {selectedEntry?.id || "Default"}
        </span>
        {isDefault && <Star className="h-3 w-3 text-text-muted" fill="currentColor" />}
        <ChevronDown className="h-3 w-3 text-text-faint" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-xl border border-line bg-panel shadow-md">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="h-3.5 w-3.5 text-text-faint" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search models..."
              className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-faint focus:outline-none"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {filteredModels.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-text-muted">
                No models found
              </div>
            ) : (
              filteredModels.map((model, index) => (
                <button
                  key={model.id}
                  onClick={() => handleSelect(model.id)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors ${
                    index === highlightedIndex
                      ? "bg-panel-hover text-text-primary"
                      : "text-text-secondary hover:bg-panel-hover"
                  } ${
                    selectedModel === model.id
                      ? "border-l-2 border-accent bg-panel-raised"
                      : "border-l-2 border-transparent"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">
                      {highlightMatch(model.id, query)}
                    </div>
                    <div className="truncate text-[10px] text-text-muted">
                      {model.providerId}
                    </div>
                  </div>
                  {defaultModel === model.id && (
                    <Star className="ml-2 h-3 w-3 shrink-0 text-text-muted" fill="currentColor" />
                  )}
                </button>
              ))
            )}
          </div>

          {selectedModel && !isDefault && (
            <div className="border-t border-line px-3 py-2">
              <button
                onClick={() => {
                  onSetDefault(selectedModel);
                  setIsOpen(false);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-panel-raised px-2 py-1.5 text-xs text-text-secondary transition-colors hover:bg-panel-hover"
              >
                <Star className="h-3 w-3" />
                Set as default
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
