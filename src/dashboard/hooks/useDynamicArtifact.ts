import { useEffect, useState, useCallback, useRef } from 'react';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('useDynamicArtifact');
const moduleCache = new Map<string, React.ComponentType>();

interface UseDynamicArtifactOptions {
  retryCount?: number;
  timeout?: number;
  cache?: boolean;
  debug?: boolean;
  version?: number | string;
}

interface UseDynamicArtifactResult {
  Component: React.ComponentType | null;
  error: Error | null;
  loading: boolean;
  retry: () => void;
  invalidateCache: () => void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  options: { timeout: number; signal?: AbortSignal },
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function useDynamicArtifact(
  slug: string,
  options?: UseDynamicArtifactOptions,
): UseDynamicArtifactResult {
  const {
    retryCount = 2,
    timeout = 30000,
    cache = true,
    debug = false,
    version,
  } = options || {};

  const cacheKey = version !== undefined ? `${slug}:${version}` : slug;

  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const blobUrlRef = useRef<string | null>(null);

  const cleanupBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Check client cache
    if (cache && moduleCache.has(cacheKey)) {
      if (debug) log.debug(`cache hit: ${cacheKey}`);
      setComponent(() => moduleCache.get(cacheKey)!);
      setLoading(false);
      return;
    }

    let lastError: Error = new Error('Unknown error');

    for (let i = 0; i < retryCount; i++) {
      try {
        if (debug) log.debug(`attempt ${i + 1}: ${slug}`);

        const response = await fetchWithTimeout(
          `/api/artifacts/${slug}/bundle`,
          { timeout },
        );

        if (!response.ok) {
          let errorMsg = `Failed to load artifact (${response.status})`;
          try {
            const errorData = await response.json();
            errorMsg = errorData.message || errorMsg;
          } catch {
            // Use default error message
          }
          throw new Error(errorMsg);
        }

        // Get JS code as text
        const code = await response.text();

        // Create blob URL for ES module import
        cleanupBlobUrl();
        const blob = new Blob([code], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        // Dynamic import - @vite-ignore to prevent Vite from processing
        const module = await import(/* @vite-ignore */ url);

        const ArtifactComponent = module.default;

        if (!ArtifactComponent || typeof ArtifactComponent !== 'function') {
          throw new Error('Artifact must export a default React component');
        }

        if (cache) {
          moduleCache.set(cacheKey, ArtifactComponent);
        }

        setComponent(() => ArtifactComponent);
        setLoading(false);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (debug) log.warn(`attempt ${i + 1} failed:`, lastError.message);
        if (i < retryCount - 1) {
          await delay(1000 * (i + 1));
        }
      }
    }

    setError(lastError);
    setLoading(false);
  }, [slug, retryCount, timeout, cache, debug, cleanupBlobUrl]);

  const invalidateCache = useCallback(() => {
    moduleCache.delete(cacheKey);
    cleanupBlobUrl();
    setComponent(null);
    setError(null);
  }, [cacheKey, cleanupBlobUrl]);

  useEffect(() => {
    load();
  }, [load]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupBlobUrl();
    };
  }, [cleanupBlobUrl]);

  return {
    Component,
    error,
    loading,
    retry: () => {
      invalidateCache();
      // Re-trigger load after state reset
      setTimeout(load, 0);
    },
    invalidateCache,
  };
}
