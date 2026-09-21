import { useRef, useCallback, type FormEvent, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'Type a message...',
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      adjustHeight();
    },
    [onChange, adjustHeight]
  );

  const handleSubmit = useCallback(() => {
    if (!value.trim() || disabled) return;
    onSubmit(value.trim());
    onChange('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSubmit, onChange]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); handleSubmit(); }} className="border-t border-line p-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 min-h-[40px] max-h-[200px] resize-none rounded-xl border border-line bg-panel-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-faint focus:border-accent focus:outline-none disabled:opacity-50"
          style={{ scrollbarWidth: 'thin' }}
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
          title="Send (Enter)"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-text-faint px-1">
        Press <kbd className="rounded bg-panel-raised px-1 py-0.5 font-mono">Enter</kbd> to send,{' '}
        <kbd className="rounded bg-panel-raised px-1 py-0.5 font-mono">Shift+Enter</kbd> for new line
      </p>
    </form>
  );
}
