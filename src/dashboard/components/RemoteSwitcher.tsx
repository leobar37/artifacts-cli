import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Server } from 'lucide-react';
import type { RemoteSummary } from '../../types/artifact.js';
import { remoteUrl } from '../lib/project.js';

interface RemoteSwitcherProps {
  remoteId: string;
  remotes: RemoteSummary[];
}

/** Broker remote picker; reuses the ProjectSwitcher keyboard/popover behavior. */
export function RemoteSwitcher({ remoteId, remotes }: RemoteSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const current = remotes.find((r) => r.remoteId === remoteId) ?? remotes[0];

  useEffect(() => {
    if (!open) return;
    setHighlight(Math.max(0, remotes.findIndex((r) => r.remoteId === remoteId)));
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => Math.min(remotes.length - 1, h + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => Math.max(0, h - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = remotes[highlight];
        if (target) go(target.remoteId);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, remotes, remoteId, highlight]);

  const go = (id: string) => {
    if (id !== remoteId) {
      window.location.href = remoteUrl(id);
    } else {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Switch remote"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex max-w-56 items-center gap-2 truncate rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-panel-hover hover:text-text-primary"
      >
        <Server className="h-3.5 w-3.5 shrink-0 text-text-faint" />
        <span className="truncate">{current?.name ?? 'Select remote'}</span>
        {current && (
          <span className="shrink-0 text-[10px] font-medium text-text-faint">
            {current.status === 'online' ? 'Online' : 'Offline'}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-panel shadow-xl"
        >
          {remotes.map((r, i) => {
            const active = r.remoteId === remoteId;
            return (
              <button
                key={r.remoteId}
                role="option"
                aria-selected={active}
                onClick={() => go(r.remoteId)}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                  i === highlight ? 'bg-panel-hover' : ''
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-xs font-medium ${active ? 'text-text-primary' : 'text-text-secondary'}`}>
                    {r.name}
                  </span>
                  <span className="block truncate text-[11px] text-text-faint">
                    {r.status === 'online' ? 'Online' : `Offline · seen ${r.lastSeenAt}`} · {r.artifactCount} artifact{r.artifactCount !== 1 ? 's' : ''}
                  </span>
                </span>
                {active && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
