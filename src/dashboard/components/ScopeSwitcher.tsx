import { useEffect, useId, useRef, useState, type ComponentType } from 'react';
import { Check, ChevronDown, ArrowUpRight } from 'lucide-react';
import { SearchInput } from './SearchInput.js';
import { matchesText } from '../lib/artifact-search.js';

export interface ScopeOption {
  id: string;
  name: string;
  description?: string;
  status?: 'online' | 'offline';
}

interface ScopeSwitcherProps {
  label: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  currentId: string;
  options: ScopeOption[];
  onSelect: (id: string) => void;
  placeholder: string;
  overviewHref?: string;
  overviewLabel?: string;
  hint?: string;
}

/** Searchable scope picker shared by local and broker navigation. */
export function ScopeSwitcher({ label, title, icon: Icon, currentId, options, onSelect, placeholder, overviewHref, overviewLabel, hint }: ScopeSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = options.find((option) => option.id === currentId);
  const visible = options.filter((option) => matchesText(`${option.name} ${option.description ?? ''}`, query));

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const choose = (id: string) => {
    close();
    if (id !== currentId) onSelect(id);
  };

  useEffect(() => {
    if (!open) return;
    containerRef.current?.querySelector('input')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlight((index) => Math.max(0, Math.min(visible.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
      } else if (event.key === 'Enter' && containerRef.current?.contains(event.target as Node)) {
        // Auxiliary links and buttons retain their own Enter behavior.
        const target = event.target as Element;
        if (target.closest('a') || target.closest('button:not([role="option"])')) return;
        event.preventDefault();
        const option = visible[highlight];
        if (option) choose(option.id);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, visible, highlight, currentId, onSelect]);

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${highlight}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, highlight, listId]);

  return (
    <div ref={containerRef} className="relative min-w-0 sm:min-w-44">
      <button
        ref={triggerRef}
        type="button"
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          setQuery('');
          setHighlight(Math.max(0, options.findIndex((option) => option.id === currentId)));
          setOpen((value) => !value);
        }}
        className={`flex w-full max-w-72 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${open ? 'border-accent bg-panel-hover' : 'border-line bg-panel-raised hover:border-accent hover:bg-panel-hover'}`}
      >
        <Icon className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {label}
            {current?.status && <span className="font-normal normal-case tracking-normal">{current.status === 'online' ? 'Online' : 'Offline'}</span>}
          </span>
          <span className="block truncate text-xs font-medium text-text-primary">{current?.name ?? `Select ${label.toLowerCase()}`}</span>
        </span>
        {current?.status && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${current.status === 'online' ? 'bg-emerald-500' : 'bg-text-muted'}`} title={current.status === 'online' ? 'Online' : 'Offline'} />}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="scope-popover absolute left-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-panel shadow-xl">
          <div className="border-b border-line p-3">
            <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-text-secondary">
              <span>{title}</span>
              <span className="text-text-muted">{options.length}</span>
            </div>
            <SearchInput value={query} onChange={(value) => { setQuery(value); setHighlight(0); }} placeholder={placeholder} ariaLabel={placeholder.replace('…', '')} />
          </div>
          <div id={listId} role="listbox" aria-label={label} aria-activedescendant={visible[highlight] ? `${listId}-${highlight}` : undefined} className="max-h-[min(20rem,45dvh)] overflow-y-auto p-1.5">
            {visible.map((option, index) => (
              <button
                id={`${listId}-${index}`}
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === currentId}
                onClick={() => choose(option.id)}
                onMouseEnter={() => setHighlight(index)}
                onFocus={() => setHighlight(index)}
                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${index === highlight ? 'bg-panel-hover' : ''}`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${option.id === currentId ? 'text-accent' : 'text-text-muted'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-text-primary">{option.name}</span>
                  {(option.status || option.description) && (
                    <span className="mt-0.5 block truncate text-[11px] text-text-muted" title={option.description}>
                      {option.status && <span className={option.status === 'online' ? 'text-emerald-600 dark:text-emerald-400' : ''}>{option.status === 'online' ? 'Online' : 'Offline'} · </span>}
                      {option.description}
                    </span>
                  )}
                </span>
                {option.id === currentId && <Check className="h-4 w-4 shrink-0 text-accent" />}
              </button>
            ))}
            {visible.length === 0 && <p className="px-3 py-6 text-center text-xs text-text-muted">No {label.toLowerCase()}s match “{query.trim()}”.</p>}
          </div>
          {(hint || overviewHref) && (
            <div className="border-t border-line bg-panel-raised p-3">
              {hint && <p className="text-[11px] leading-relaxed text-text-muted">{hint}</p>}
              {overviewHref && <a href={overviewHref} className="flex items-center justify-between text-xs font-medium text-text-secondary hover:text-text-primary">{overviewLabel}<ArrowUpRight className="h-3.5 w-3.5" /></a>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
