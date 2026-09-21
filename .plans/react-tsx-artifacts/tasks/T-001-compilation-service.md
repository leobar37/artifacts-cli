# T-001: Setup del Servicio de Compilación

## Objetivo
Crear servicio Express que compile TSX on-the-fly usando esbuild.

## Requisitos Relacionados
- FR-002: Compilación On-the-Fly
- NFR-001: Performance

## Archivos a Crear/Modificar

### Crear
- `src/server/services/compiler.ts` - Servicio principal de compilación
- `src/server/routes/artifacts.ts` - Endpoint de API para compilación

### Modificar
- `src/server/index.ts` - Registrar nueva ruta
- `package.json` - Verificar/agregar esbuild como dependencia

## Detalles de Implementación

### Servicio de Compilación (`compiler.ts`)

```typescript
interface CompileOptions {
  filePath: string;
  cache?: boolean;
}

interface CompileResult {
  code: string;
  success: true;
}

interface CompileError {
  error: string;
  message: string;
  line?: number;
  column?: number;
  success: false;
}

type CompileOutput = CompileResult | CompileError;

class CompilationService {
  async compile({ filePath }: CompileOptions): Promise<CompileOutput> {
    // Usar esbuild para transpilar TSX a ESM
    // Target: es2020
    // Format: esm
    // JSX: transform (usar React.createElement)
    // Bundle: false (solo transpilar, no resolver imports)
  }
}
```

### Configuración esbuild

```typescript
import { transform } from 'esbuild';

const result = await transform(sourceCode, {
  loader: 'tsx',
  target: 'es2020',
  format: 'esm',
  jsx: 'transform',
  sourcemap: false, // Podemos agregar después
});
```

### Endpoint API

```typescript
// GET /api/artifacts/:slug/bundle
app.get('/api/artifacts/:slug/bundle', async (req, res) => {
  const { slug } = req.params;
  const filePath = resolveArtifactPath(slug, 'content.tsx');
  
  // Verificar que existe
  // Compilar con servicio
  // Retornar JS o error
});
```

## Criterios de Aceptación

- [ ] Endpoint `/api/artifacts/:slug/bundle` existe y retorna JS compilado
- [ ] Compilación de archivo TSX simple toma < 1 segundo
- [ ] Errores de sintaxis retornan JSON con línea y columna
- [ ] Output es ESM válido con export default
- [ ] Code coverage > 80% para el servicio

## Pasos de Verificación

1. Crear archivo de prueba: `docs/artifacts/test-component/content.tsx`
2. Hacer request a `/api/artifacts/test-component/bundle`
3. Verificar que retorna JavaScript válido
4. Introducir error de sintaxis y verificar error handling

## Open Questions

- ¿Usar esbuild directo o su transform API?
- ¿Necesitamos source maps para debugging?
- ¿Bundlear React con el artifact o usar external (peer dependency)?
