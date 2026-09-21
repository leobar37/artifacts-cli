# T-007: Error Boundaries

## Objetivo
Implementar error boundaries robustos con UI de recuperación.

## Requisitos Relacionados
- FR-007: Error Boundaries y Aislamiento

## Archivos a Crear/Modificar

### Crear
- `src/dashboard/components/ArtifactErrorBoundary.tsx` - Error boundary específico

## Detalles de Implementación

### ArtifactErrorBoundary Component

```typescript
// src/dashboard/components/ArtifactErrorBoundary.tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ArtifactErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Artifact render error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return <DefaultErrorView error={this.state.error} onReset={this.reset} />;
    }

    return this.props.children;
  }
}

// Vista de error por defecto
function DefaultErrorView({ 
  error, 
  onReset 
}: { 
  error: Error | null; 
  onReset: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 text-4xl">⚠️</div>
      <h3 className="mb-2 text-lg font-medium text-red-400">
        Artifact Error
      </h3>
      <p className="mb-4 max-w-md text-sm text-slate-500">
        {error?.message || 'An error occurred while rendering this artifact'}
      </p>
      <div className="flex gap-2">
        <button
          onClick={onReset}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
```

### Integración con ArtifactRenderer

```typescript
// ArtifactRenderer.tsx usa el boundary
<Suspense fallback={...}>
  <ArtifactErrorBoundary>
    <Component />
  </ArtifactErrorBoundary>
</Suspense>
```

## Criterios de Aceptación

- [ ] Error boundary captura errores de renderizado
- [ ] UI muestra mensaje de error y opción para retry
- [ ] Reset limpia el estado y re-intenta render
- [ ] Múltiples errores consecutivos manejados correctamente
- [ ] Error en un artifact no afecta otros

## Pasos de Verificación

1. Crear artifact con error de render: `throw new Error('test')`
2. Verificar error boundary captura y muestra UI
3. Click "Try Again" → verificar reintenta
4. Verificar console.log tiene stack trace
