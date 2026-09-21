# Contexto: Artifacts React con Carga Dinámica (TSX Directo)

## Objetivo
Transformar el dashboard de artifacts para que pueda cargar y renderizar componentes React (TSX/JSX) dinámicamente, en lugar de solo mostrar HTML estático via iframe. El agente escribirá código React directamente, teniendo total libertad sobre el contenido.

## Arquitectura Actual

### Dashboard (Verified)
- **Stack**: React 19 + TypeScript + Vite
- **Entry**: `src/dashboard/main.tsx` → `App.tsx`
- **Rendering actual**: `ArtifactViewer.tsx` usa `<iframe src="/artifacts/{slug}/index.html">`
- **Build**: Vite con root en `src/dashboard`, output en `dist/dashboard`

### Servidor (Verified)
- **Stack**: Express + TypeScript
- **Static**: Sirve archivos desde `docs/artifacts/[slug]/index.html`
- **API**: Endpoints `/api/artifacts`, `/api/project`, `/api/chat/*`

### Artifact Base Skill (Verified)
- Genera artifacts como HTML estático con Tailwind + Alpine.js
- Output: `docs/artifacts/[slug]/index.html`
- No usa React en la generación actual

## Arquitectura Propuesta

### Nuevo Flujo de Datos
```
Agente escribe → docs/artifacts/[slug]/content.tsx
                      ↓
Dashboard detecta tipo (TSX vs HTML)
                      ↓
    ┌─────────────────┴─────────────────┐
    ↓                                   ↓
TSX detectado                    HTML detectado
    ↓                                   ↓
Compila con esbuild              Carga en iframe (actual)
    ↓                                   ↓
Dynamic import()                 Sandbox HTML
    ↓
Renderiza con <ArtifactRenderer />
```

### Componentes Clave a Crear

1. **ArtifactRenderer** - Wrapper que maneja carga dinámica, error boundaries, y providers
2. **ModuleLoader** - Utilidad para import() dinámico con cache invalidation
3. **CompilationService** - Servidor Express endpoint para compilar TSX on-the-fly
4. **TypeDetector** - Detecta si artifact es TSX o HTML

### Formato de Artifact TSX

```typescript
// docs/artifacts/my-visualization/content.tsx
import { useState } from 'react';

export default function MyVisualization() {
  const [count, setCount] = useState(0);
  
  return (
    <div className="p-8 bg-slate-900 text-white">
      <h1 className="text-2xl font-bold">Mi Visualización</h1>
      <button 
        onClick={() => setCount(c => c + 1)}
        className="mt-4 px-4 py-2 bg-blue-600 rounded"
      >
        Contador: {count}
      </button>
    </div>
  );
}
```

## Alcance

### Dentro del alcance
- Carga dinámica de componentes TSX en dashboard
- Compilación on-the-fly de TSX (dev mode)
- Soporte para hooks React (useState, useEffect, etc.)
- Integración con Tailwind (usa misma config que dashboard)
- Error boundaries para aislar fallos de artifact
- Fallback a HTML para artifacts legacy

### Fuera del alcance
- Hot module replacement (HMR) complejo - solo full reload
- Soporte para imports de librerías externas en artifacts
- Debugging avanzado de artifacts
- SSR (Server-Side Rendering)
- Build de artifacts para producción (sólo dev mode inicial)

## Riesgos Identificados

1. **Seguridad**: `eval()` o ejecución de código dinámico puede ser riesgoso
   - Mitigación: Usar esbuild/swc para transpilar, no eval directo. Sanitizar imports.

2. **Performance**: Compilación on-the-fly puede ser lenta
   - Mitigación: Cache en memory/disk. Compilación async con loading states.

3. **Aislamiento**: Errores en artifact pueden crashear todo el dashboard
   - Mitigación: Error boundaries robustos. Aislamiento de estado.

4. **Complejidad**: Mucho más complejo que iframe
   - Mitigación: Fallback siempre disponible a HTML. Feature flag opcional.

## Files Clave del Codebase

### Dashboard
- `src/dashboard/components/ArtifactViewer.tsx` - Punto de integración principal
- `src/dashboard/hooks/useArtifacts.ts` - Agregar detección de tipo
- `src/dashboard/types/artifact.ts` - Extender interfaz Artifact

### Servidor
- `src/server/routes/artifacts.ts` - Nuevo endpoint de compilación
- `src/server/services/compiler.ts` - Servicio de esbuild

### Skill (Factory)
- `~/.factory/skills/artifact-base/SKILL.md` - Documentar nuevo formato TSX

## Dependencias a Evaluar

- `esbuild`: Compilación rápida de TSX (ya puede estar en deps)
- `react-error-boundary`: Error boundaries robustos
- `@esbuild-plugins/node-globals-polyfill`: Si se necesitan polyfills

## Métricas de Éxito

1. Un artifact TSX simple renderiza en < 2 segundos (incluyendo compilación)
2. Artifacts legacy HTML siguen funcionando sin cambios
3. Errores de sintaxis en artifact no crashean dashboard
4. Hooks React funcionan correctamente en artifacts
