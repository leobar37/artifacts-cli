# T-002: Cache de Compilación

## Objetivo
Implementar sistema de cache en memory para artifacts compilados.

## Requisitos Relacionados
- FR-002: Compilación On-the-Fly
- NFR-001: Performance

## Archivos a Crear/Modificar

### Modificar
- `src/server/services/compiler.ts` - Agregar cache layer

## Detalles de Implementación

### Estrategia de Cache

```typescript
interface CacheEntry {
  code: string;
  compiledAt: Date;
  mtime: number; // statSync(file).mtimeMs
}

class CompilationCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 50; // máximo de entries
  
  get(filePath: string): CacheEntry | undefined {
    // Verificar si el archivo cambió desde cache
    // Si mtime cambió, invalidar entry
  }
  
  set(filePath: string, entry: CacheEntry): void {
    // Agregar a cache, LRU eviction si excede maxSize
  }
  
  invalidate(filePath: string): void {
    // Remover del cache
  }
}
```

### Integración con Compiler

```typescript
async compile({ filePath, cache = true }: CompileOptions): Promise<CompileOutput> {
  // 1. Verificar cache si cache=true
  const cached = cache && this.cache.get(filePath);
  if (cached && cached.mtime === statSync(filePath).mtimeMs) {
    return { code: cached.code, success: true };
  }
  
  // 2. Compilar
  const result = await esbuildTransform(sourceCode, options);
  
  // 3. Guardar en cache
  if (cache && result.success) {
    this.cache.set(filePath, {
      code: result.code,
      compiledAt: new Date(),
      mtime: statSync(filePath).mtimeMs,
    });
  }
  
  return result;
}
```

## Criterios de Aceptación

- [ ] Segundo request al mismo artifact usa cache (toma < 100ms)
- [ ] Modificar archivo invalida cache automáticamente
- [ ] Cache tiene límite de 50 entries (LRU eviction)
- [ ] Memory usage < 100MB para cache
- [ ] Cache se mantiene entre requests pero no entre reinicios de servidor

## Pasos de Verificación

1. Compilar artifact → medir tiempo
2. Volver a compilar mismo artifact → verificar < 100ms
3. Modificar archivo, compilar → verificar cache miss
4. Compilar 100 artifacts diferentes → verificar LRU funciona
