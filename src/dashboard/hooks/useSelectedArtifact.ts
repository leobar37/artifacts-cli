import { useCallback, useEffect, useState } from 'react';
import type { Artifact } from '../../types/artifact.js';

/** Selection belongs to the URL, so copied links, reloads and browser history agree. */
export function useSelectedArtifact(artifacts: readonly Artifact[]) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(() => new URLSearchParams(window.location.search).get('select'));

  useEffect(() => {
    const onPopState = () => setSelectedSlug(new URLSearchParams(window.location.search).get('select'));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const selectArtifact = useCallback((artifact: Artifact | null) => {
    const slug = artifact?.slug ?? null;
    const url = new URL(window.location.href);
    if (url.searchParams.get('select') !== slug) {
      if (slug === null) url.searchParams.delete('select');
      else url.searchParams.set('select', slug);
      window.history.pushState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    setSelectedSlug(slug);
  }, []);

  return {
    selectedArtifact: artifacts.find((artifact) => artifact.slug === selectedSlug) ?? null,
    selectArtifact,
  };
}
