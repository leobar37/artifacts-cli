import { useEffect, useRef } from 'react';

type ArtifactEvent = {
  slug: string;
  lastScanAt: string;
};

type EventFilter = (event: ArtifactEvent) => boolean;

interface UseArtifactEventsOptions {
  filter?: EventFilter;
  onEvent: (event: ArtifactEvent) => void;
}

export function useArtifactEvents({ filter, onEvent }: UseArtifactEventsOptions) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const filterRef = useRef(filter);
  filterRef.current = filter;

  useEffect(() => {
    const es = new EventSource('/api/events');

    es.addEventListener('artifacts:update', (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data) as ArtifactEvent;
        if (!filterRef.current || filterRef.current(event)) {
          onEventRef.current(event);
        }
      } catch {
        // ignore parse errors
      }
    });

    es.onerror = () => {
      // EventSource auto-reconnects automatically
    };

    return () => {
      es.close();
    };
  }, []);
}
