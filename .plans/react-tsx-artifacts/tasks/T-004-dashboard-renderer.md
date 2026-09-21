# T-004: Dashboard Dynamic Component Renderer

## Objetivo
Crear componente `ArtifactRenderer` que cargue dinámicamente componentes TSX con Suspense y error boundaries.

## Requisitos Relacionados
- FR-003: Carga Dinámica de Componentes
- FR-004: Integración con ArtifactViewer
- FR-007: Error Boundaries y Aislamiento

## Archivos a Crear/Modificar

### Crear
- `src/dashboard/components/ArtifactRenderer.tsx` - Componente principal de renderizado dinámico
- `src/dashboard/hooks/useDynamicArtifact.ts` - Hook de carga dinámica

### Modificar
- `src/dashboard/components/ArtifactViewer.tsx` - Integrar renderer

## Detalles de Implementación

### ArtifactRenderer Component

```typescript
// src/dashboard/components/ArtifactRenderer.tsx
import { Suspense, useEffect, useState } from 'react';
import { useDynamicArtifact } from '../hooks/useDynamicArtifact.js';

interface ArtifactRendererProps {
  slug: string;
  fallback?: React.ReactNode;
}

export function ArtifactRenderer({ slug, fallback }: ArtifactRendererProps) {
  const { Component, error, loading, retry } = useDynamicArtifact(slug);
  
  if (loading) {
    return fallback || <DefaultLoadingState />;
  }
  
  if (error) {
    return <ArtifactError error={error} onRetry={retry} />;
  }
  
  if (!Component) {
    return <ArtifactNotFound />;
  }
  
  return (
    <Suspense fallback={fallback || <DefaultLoadingState />}>
      <ArtifactErrorBoundary onError={(err) => console.error(err)}>
        <Component />
      </ArtifactErrorBoundary>
    </Suspense>
  );
}
```

### useDynamicArtifact Hook

```typescript
// src/dashboard/hooks/useDynamicArtifact.ts
import { useEffect, useState, useCallback } from 'react';

interface UseDynamicArtifactResult {
  Component: React.ComponentType | null;
  error: Error | null;
  loading: boolean;
  retry: () => void;
}

export function useDynamicArtifact(slug: string): UseDynamicArtifactResult {
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // 1. Fetch bundle from server
      const response = await fetch(`/api/artifacts/${slug}/bundle`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to load artifact');
      }
      
      // 2. Get JS code as text
      const code = await response.text();
      
      // 3. Create blob URL for ES module
      const blob = new Blob([code], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      
      // 4. Dynamic import
      const module = await import(/* webpackIgnore: true */ url);
      
      // 5. Get default export
      const ArtifactComponent = module.default;
      
      if (!ArtifactComponent || typeof ArtifactComponent !== 'function') {
        throw new Error('Artifact must export a default React component');
      }
      
      setComponent(() => ArtifactComponent);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [slug]);
  
  useEffect(() => {
    load();
    
    // Cleanup
    return () => {
      // Revoke blob URL to free memory
      // NOTE: store URL in ref to revoke later
    };
  }, [load]);
  
  return {
    Component,
    error,
    loading,
    retry: load,
  };
}
```

### Integration with ArtifactViewer

```typescript
// src/dashboard/components/ArtifactViewer.tsx
// Modificar para usar ArtifactRenderer cuando format='tsx'

export function ArtifactViewer({ artifact }: ArtifactViewerProps) {
  // ... existing code ...
  
  return (
    <div className="flex h-full flex-col bg-slate-950">
      {/* Header ... */}
      
      {/* Content */}
      <div className="relative flex-1 bg-slate-950">
        {artifact.format === 'tsx' ? (
          <ArtifactRenderer 
            slug={artifact.slug}
            fallback={<LoadingState />}
          />
        ) : (
          <iframe
            src={`/artifacts/${artifact.slug}/index.html`}
            sandbox="allow-scripts allow-same-origin allow-popups"
            className="h-full w-full border-0"
            title={artifact.title}
          />
        )}
      </div>
    </div>
  );
}
```

## Criterios de Aceptación

- [ ] Componente carga dinámicamente desde `/api/artifacts/:slug/bundle`
- [ ] Loading state mientras carga/compila
- [ ] Error state si compilación o renderizado falla
- [ ] Retry button en error state
- [ ] Unmount limpio (no memory leaks)
- [ ] Cada artifact aislado (estado no persiste entre cambios)

## Pasos de Verificación

1. Crear artifact TSX simple con contador
2. Navegar al artifact en dashboard
3. Verificar loading state
4. Verificar componente renderiza
5. Verificar interactividad (clicks funcionan)
6. Navegar a otro artifact, volver - verificar estado reseteado
7. Introducir error en TSX, verificar error boundary funciona

## Notas Técnicas

- Usar `import(/* webpackIgnore: true */ url)` para evitar que Vite procese el dynamic import
- Blob URL permite importar código como ES module sin eval
- Error boundary debe capturar errores de renderizado del artifact
- Cleanup es crítico para evitar memory leaks con blob URLs
