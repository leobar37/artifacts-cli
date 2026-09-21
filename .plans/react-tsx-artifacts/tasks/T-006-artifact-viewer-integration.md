# T-006: Integración ArtifactViewer

## Objetivo
Actualizar ArtifactViewer para detectar formato y usar renderer correcto (TSX vs HTML).

## Requisitos Relacionados
- FR-004: Integración con ArtifactViewer
- FR-008: Backward Compatibility

## Archivos a Crear/Modificar

### Modificar
- `src/dashboard/components/ArtifactViewer.tsx` - Agregar lógica de detección de formato

## Detalles de Implementación

### Detección de Formato

El Artifact ahora tiene campo `format` de la API (ver T-003), pero también debemos manejar fallback:

```typescript
function getArtifactFormat(artifact: Artifact): 'tsx' | 'html' {
  // Preferir campo format de API
  if (artifact.format) {
    return artifact.format;
  }
  
  // Fallback a HTML para backward compat
  return 'html';
}
```

### Vista de Contenido

```typescript
// src/dashboard/components/ArtifactViewer.tsx
import { ArtifactRenderer } from './ArtifactRenderer.js';

function ContentView({ artifact }: { artifact: Artifact }) {
  const format = getArtifactFormat(artifact);
  
  switch (format) {
    case 'tsx':
      return (
        <ArtifactRenderer
          slug={artifact.slug}
          fallback={
            <div className="flex h-full items-center justify-center">
              <LoadingSpinner />
              <span className="ml-2 text-slate-400">Loading React artifact...</span>
            </div>
          }
        />
      );
    
    case 'html':
    default:
      return (
        <iframe
          src={`/artifacts/${artifact.slug}/index.html`}
          sandbox="allow-scripts allow-same-origin allow-popups"
          className="h-full w-full border-0"
          title={artifact.title}
          onLoad={() => setIsLoading(false)}
          onError={() => setIsLoading(false)}
        />
      );
  }
}
```

### Transiciones Suaves

```typescript
// Estado de loading compartido entre modos
const [isLoading, setIsLoading] = useState(true);

useEffect(() => {
  setIsLoading(true);
}, [artifact?.slug]);

// En render:
{isLoading && (
  <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
    <LoadingSpinner />
  </div>
)}
```

### Manejo de Errores con Fallback

```typescript
// Si ArtifactRenderer falla, ofrecer fallback a HTML
<ArtifactRenderer
  slug={artifact.slug}
  onError={(error) => {
    console.error('TSX render failed:', error);
    // Opcionalmente, auto-fallback a HTML si existe
  }}
/>
```

## Criterios de Aceptación

- [ ] Artifact TSX renderiza con ArtifactRenderer
- [ ] Artifact HTML renderiza con iframe (comportamiento actual)
- [ ] Loading state consistente entre ambos modos
- [ ] Transición suave al cambiar entre artifacts
- [ ] Errores en TSX no afectan otros artifacts
- [ ] Artifacts legacy sin campo format funcionan como HTML

## Pasos de Verificación

1. Verificar artifact HTML existente → sigue funcionando con iframe
2. Crear artifact TSX nuevo → usa ArtifactRenderer
3. Cambiar entre TSX y HTML → transición suave sin flash
4. Verificar loading spinner aparece en ambos casos
