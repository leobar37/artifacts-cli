# T-009: Testing de Integración

## Objetivo
Probar flujo completo: crear TSX, compilar, renderizar en dashboard.

## Requisitos Relacionados
- FR-003, FR-006

## Archivos a Crear
- `src/dashboard/test/ArtifactRenderer.test.tsx`
- `test/artifacts/` - Artifacts de ejemplo para testing

## Detalles de Implementación

### Test de Integración

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ArtifactRenderer } from '../components/ArtifactRenderer.js';

describe('ArtifactRenderer Integration', () => {
  it('should render a simple TSX artifact', async () => {
    // Crear artifact de prueba
    // Renderizar ArtifactRenderer
    // Verificar que aparece en pantalla
  });
  
  it('should handle interactive artifacts', async () => {
    // Artifact con useState
    // Simular clicks
    // Verificar estado cambia
  });
  
  it('should recover from render errors', async () => {
    // Artifact con error de render
    // Verificar error boundary funciona
    // Click retry
    // Si se corrige, verifica que funciona
  });
});
```

### Artifacts de Ejemplo

```typescript
// test/artifacts/counter/content.tsx
import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  
  return (
    <div className="p-8">
      <h1 className="text-2xl">Counter: {count}</h1>
      <button 
        onClick={() => setCount(c => c + 1)}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
      >
        Increment
      </button>
    </div>
  );
}

// test/artifacts/hello-world/content.tsx
export default function HelloWorld() {
  return (
    <div className="p-8 text-center">
      <h1 className="text-3xl font-bold text-blue-500">
        Hello from React!
      </h1>
      <p className="mt-4 text-slate-400">
        This artifact was written in TSX
      </p>
    </div>
  );
}
```

## Criterios de Aceptación

- [ ] Test de flujo completo funciona
- [ ] Artifacts de ejemplo documentan formato esperado
- [ ] Tests pueden servir como documentación viva
- [ ] CI ejecuta tests de integración

## Pasos de Verificación

```bash
npm run test:integration
```
