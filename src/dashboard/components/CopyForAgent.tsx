import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, X } from 'lucide-react';
import { copyText } from '../lib/clipboard.js';

export function CopyForAgent({ content }: { content: string }) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'blocked'>('idle');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (status === 'blocked') {
      textRef.current?.focus();
      textRef.current?.select();
    }
    if (status === 'copied') {
      const timer = setTimeout(() => setStatus('idle'), 2500);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const closeDialog = () => {
    setStatus('idle');
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Copy for agent"
        title="Copy artifact location and editing instructions for an agent"
        disabled={status === 'copying'}
        onClick={async () => {
          setStatus('copying');
          const copied = await copyText(content);
          setStatus(copied ? 'copied' : 'blocked');
        }}
        className="flex h-9 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-xs font-medium text-text-secondary shadow-sm transition-colors hover:bg-panel-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-60"
      >
        {status === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {status === 'copied' ? 'Copied' : status === 'copying' ? 'Copying…' : 'Copy for agent'}
      </button>
      <span role="status" className="sr-only">{status === 'copied' ? 'Agent instructions copied to clipboard.' : ''}</span>
      {status === 'blocked' && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-copy-title"
            aria-describedby="agent-copy-help"
            className="flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-xl border border-line bg-panel p-4 shadow-xl"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeDialog();
              } else if (event.key === 'Tab') {
                event.preventDefault();
                if (document.activeElement === textRef.current) closeRef.current?.focus();
                else textRef.current?.focus();
              }
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 id="agent-copy-title" className="text-sm font-semibold text-text-primary">Copy instructions for your agent</h2>
              <button ref={closeRef} type="button" onClick={closeDialog} aria-label="Close copy instructions" className="rounded-lg p-2 text-text-muted hover:bg-panel-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><X className="h-4 w-4" /></button>
            </div>
            <p id="agent-copy-help" className="mb-3 text-xs leading-relaxed text-text-secondary">Your browser blocked automatic copying. The text is selected: press Ctrl+C or ⌘C, then paste it into your agent.</p>
            <textarea ref={textRef} readOnly value={content} aria-label="Agent instructions" onFocus={(event) => event.currentTarget.select()} className="min-h-0 flex-1 resize-none rounded-lg border border-line bg-bg p-3 font-mono text-xs leading-relaxed text-text-primary focus:border-accent focus:outline-none" rows={18} />
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
