# T-005: Module Loader Utility

## Objetivo
Crear hook `useDynamicArtifact` que maneja import() dinámico, cache invalidation, y error handling.

## Requisitos Relacionados
- FR-003: Carga Dinámica de Componentes
- NFR-003: Developer Experience

## Archivos a Crear/Modificar

### Crear
- `src/dashboard/hooks/useDynamicArtifact.ts` - Hook principal (ya mencionado en T-004, aquí refinamos)

## Detalles de Implementación

### Features Adicionales a T-004

Además de lo básico en T-004, agregar:

1. **Cache en cliente**: No volver a fetch si ya se cargó en la sesión
2. **Retry automático**: Reintentar 2 veces antes de mostrar error
3. **Timeout**: Cancelar si toma más de 30 segundos
4. **Debug mode**: Console logs detallados en dev mode

### Implementación Mejorada

```typescript
// Opciones de configuración
interface UseDynamicArtifactOptions {
  retryCount?: number;
  timeout?: number;
  cache?: boolean;
  debug?: boolean;
}

// Resultado extendido
interface UseDynamicArtifactResult {
  Component: React.ComponentType | null;
  error: Error | null;
  loading: boolean;
  retry: () => void;
  invalidateCache: () => void; // NUEVO
}
```

### Cache del Cliente

```typescript
const moduleCache = new Map<string, React.ComponentType>();

function useDynamicArtifact(slug: string, options?: UseDynamicArtifactOptions) {
  // ... código ...
  
  const load = useCallback(async () => {
    // 1. Verificar cache del cliente
    if (cache && moduleCache.has(slug)) {
      setComponent(moduleCache.get(slug)!);
      setLoading(false);
      return;
    }
    
    // 2. Fetch con retry logic
    let lastError;
    for (let i = 0; i < (retryCount || 1); i++) {
      try {
        const module = await fetchWithTimeout(
          `/api/artifacts/${slug}/bundle`,
          { timeout: timeout || 30000 }
        );
        
        // ... procesar ...
        
        // 3. Guardar en cache
        if (cache) {
          moduleCache.set(slug, ArtifactComponent);
        }
        
        return; // Success
      } catch (err) {
        lastError = err;
        if (debug) console.warn(`Attempt ${i + 1} failed:`, err);
        if (i < (retryCount || 1) - 1) {
          await delay(1000 * (i + 1)); // Exponential backoff
        }
      }
    }
    
    // 4. All retries failed
    setError(lastError);
  }, [slug]);
  
  const invalidateCache = useCallback(() => {
    moduleCache.delete(slug);
    URL.revokeObjectURL(...); // cleanup
  }, [slug]);
  
  // ...
}
```

## Criterios de Aceptación

- [ ] Client-side cache evita re-fetch si componente ya cargado
- [ ] Retry automático con exponential backoff
- [ ] Timeout de 30 segundos cancela request pendiente
- [ ] `invalidateCache` permite forzar re-carga
- [ ] Debug mode muestra logs detallados
- [ ] Cleanup de blob URLs y timeouts al unmount

## Pasos de Verificación

1. Cargar artifact, navegar a otro, volver - verificar no hay segundo fetch
2. Desconectar red, cargar artifact - verificar retry logic funciona
3. Largar request que tarde > 30s - verificar timeout
4. Llamar invalidateCache y re-render - verificar nuevo fetch
