import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, FolderOpen } from 'lucide-react';
import type { ProjectEntry } from '../../types/artifact.js';

interface ProjectSwitcherProps {
  projectId: string;
  projects: ProjectEntry[];
}

export function ProjectSwitcher({ projectId, projects }: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const current = projects.find((p) => p.projectId === projectId) ?? projects[0];

  useEffect(() => {
    if (!open) return;
    setHighlight(Math.max(0, projects.findIndex((p) => p.projectId === projectId)));
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
        setHighlight((h) => Math.min(projects.length - 1, h + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => Math.max(0, h - 1));
      } else if (e.key === 'Enter') {
        const picked = projects[highlight];
        if (picked && picked.projectId !== projectId) {
          window.location.href = `/p/${picked.projectId}/`;
        } else {
          setOpen(false);
        }
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, projects, projectId, highlight]);

  const go = (id: string) => {
    if (id !== projectId) {
      window.location.href = `/p/${id}/`;
    } else {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Switch project"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex max-w-56 items-center gap-2 truncate rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-panel-hover hover:text-text-primary"
      >
        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-text-faint" />
        <span className="truncate">{current?.name ?? 'Select project'}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-xl border border-line bg-panel shadow-xl"
        >
          {projects.map((p, i) => {
            const active = p.projectId === projectId;
            return (
              <button
                key={p.projectId}
                role="option"
                aria-selected={active}
                onClick={() => go(p.projectId)}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                  i === highlight ? 'bg-panel-hover' : ''
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-xs font-medium ${active ? 'text-text-primary' : 'text-text-secondary'}`}>
                    {p.name}
                  </span>
                  <span className="block truncate text-[11px] text-text-faint">
                    {p.projectPath}
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
