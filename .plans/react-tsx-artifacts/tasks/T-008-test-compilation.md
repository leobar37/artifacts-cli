# T-008: Test del Compilador

## Objetivo
Tests unitarios para el servicio de compilación.

## Requisitos Relacionados
- NFR-004: Mantenibilidad

## Archivos a Crear
- `src/server/services/compiler.test.ts` - Tests del compilador
- `src/server/test/fixtures/` - Fixtures de prueba

## Detalles de Implementación

### Tests a Implementar

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { CompilationService } from './compiler.js';

describe('CompilationService', () => {
  let service: CompilationService;
  
  beforeEach(() => {
    service = new CompilationService();
  });
  
  describe('compile TSX', () => {
    it('should compile valid TSX to ESM', async () => {
      // Test con componente simple
    });
    
    it('should handle JSX syntax', async () => {
      // Test con JSX tags
    });
    
    it('should handle TypeScript types', async () => {
      // Test con anotaciones de tipo
    });
    
    it('should support hooks', async () => {
      // Test con useState, useEffect
    });
  });
  
  describe('error handling', () => {
    it('should return error for syntax errors', async () => {
      // Test con código inválido
    });
    
    it('should include line and column in errors', async () => {
      // Verificar formato de error
    });
  });
  
  describe('cache', () => {
    it('should cache compiled output', async () => {
      // Verificar cache funciona
    });
    
    it('should invalidate cache on file change', async () => {
      // Verificar invalidación
    });
  });
});
```

### Fixtures

```typescript
// fixtures/valid-component.tsx
export default function ValidComponent() {
  return <div>Hello World</div>;
}

// fixtures/component-with-hooks.tsx
import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}

// fixtures/syntax-error.tsx
export default function Broken {
  // Falta paréntesis aquí, debería dar error
}
```

## Criterios de Aceptación

- [ ] Cobertura > 80% para `compiler.ts`
- [ ] Tests pasan en CI
- [ ] Tests documentan comportamiento esperado
- [ ] Fixtures incluyen casos edge

## Pasos de Verificación

```bash
npm test src/server/services/compiler.test.ts
```
