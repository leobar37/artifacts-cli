import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
}

/** Reusable dashboard search box: icon, clear button, Esc clears. */
export function SearchInput({ value, onChange, placeholder = "Search…", ariaLabel = "Search", id }: SearchInputProps) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
      <input
        id={id}
        type="search"
        role="searchbox"
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) onChange("");
        }}
        className="w-full rounded-lg border border-line bg-bg py-1.5 pl-8 pr-7 text-xs text-text-primary placeholder:text-text-faint focus:border-accent focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          title="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-faint hover:bg-panel-hover hover:text-text-secondary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
