# Requisitos: Artifacts React con Carga Dinámica

## Requisitos Funcionales

### FR-001: Detección de Tipo de Artifact
**Como** sistema de artifacts
**Quiero** detectar automáticamente si un artifact es TSX o HTML
**Para** elegir el renderer correcto sin configuración manual

**Criterios de Aceptación:**
- Si existe `docs/artifacts/[slug]/content.tsx` → tratar como TSX
- Si solo existe `docs/artifacts/[slug]/index.html` → tratar como HTML (legacy)
- API `/api/artifacts` debe incluir campo `format: 'tsx' | 'html'` en respuesta
- Prioridad: TSX sobre HTML si ambos existen

### FR-002: Compilación On-the-Fly
**Como** desarrollador
**Quiero** que los artifacts TSX se compilen automáticamente al cargar
**Para** no necesitar build step manual

**Criterios de Aceptación:**
- Endpoint `/api/artifacts/[slug]/bundle` que retorna JS compilado
- Compilación con esbuild (target: es2020, format: esm)
- Soporte para JSX, TypeScript, y hooks React
- Manejo de errores de compilación con mensajes claros
- Cache en memory (max 50 artifacts) para performance

### FR-003: Carga Dinámica de Componentes
**Como** dashboard
**Quiero** cargar componentes React dinámicamente desde URLs
**Para** renderizar artifacts TSX como parte de la app

**Criterios de Aceptación:**
- Usar `React.lazy()` + `import()` para carga dinámica
- Wrapper `ArtifactRenderer` con Suspense y loading state
- Error boundary que capture errores de renderizado
- Unmount limpio al cambiar de artifact
- No memory leaks al navegar entre artifacts

### FR-004: Integración con ArtifactViewer
**Como** usuario
**Quiero** ver artifacts TSX e HTML en el mismo viewer
**Para** tener experiencia unificada

**Criterios de Aceptación:**
- `ArtifactViewer` detecta formato y usa renderer correcto
- TSX: renderiza con `ArtifactRenderer`
- HTML: mantiene iframe existente (sin cambios)
- Transición suave entre modos (mismo loading state)
- Fallback automático a HTML si carga TSX falla

### FR-005: Soporte de Hooks React
**Como** agente
**Quiero** usar hooks React (useState, useEffect, etc.) en artifacts
**Para** crear interactividad real

**Criterios de Aceptación:**
- useState, useEffect, useRef, useMemo funcionan correctamente
- useCallback, useReducer, useContext disponibles
- Custom hooks definidos en el mismo archivo funcionan
- No se soportan imports externos de hooks (librerías)
- Estado no persiste entre navegaciones (comportamiento esperado)

### FR-006: Styling con Tailwind
**Como** agente
**Quiero** usar clases Tailwind en artifacts TSX
**Para** mantener consistencia visual con dashboard

**Criterios de Aceptación:**
- Clases Tailwind del dashboard disponibles en artifacts
- No requiere importar CSS adicional
- Soporte para custom colors del dashboard
- Responsive design funciona (usa mismo breakpoints)

### FR-007: Error Boundaries y Aislamiento
**Como** usuario
**Quiero** que errores en un artifact no crasheen todo el dashboard
**Para** tener experiencia estable

**Criterios de Aceptación:**
- Error boundary envuelve cada artifact TSX
- Errores de renderizado muestran UI amigable (no pantalla blanca)
- Opción para "reload" artifact desde error boundary
- Opción para "fallback to HTML version" si existe
- Errores de compilación muestran línea y mensaje claro

### FR-008: Backward Compatibility
**Como** usuario existente
**Quiero** que artifacts HTML existentes sigan funcionando
**Para** no romper mi flujo actual

**Criterios de Aceptación:**
- Artifacts HTML sin cambios funcionan exactamente igual
- No se requiere migración de artifacts existentes
- API `/api/artifacts` retorna ambos tipos con campo `format`
- Dashboard maneja ambos tipos transparentemente
- Default: HTML si no se especifica formato

## Requisitos No Funcionales

### NFR-001: Performance
- Compilación de artifact simple: < 1 segundo
- Carga renderizada: < 2 segundos total (compilación + render)
- Cache de compilados: TTL 5 minutos o hasta modificación
- Memory usage: max 100MB para cache de compilación

### NFR-002: Seguridad
- No ejecutar código arbitrario sin transpilar
- Sanitizar exports de módulos (solo default export permitido)
- No permitir imports dinámicos desde URLs externas
- Error boundaries aíslan código de artifact

### NFR-003: Developer Experience
- Mensajes de error claros (línea, columna, tipo de error)
- Hot reload en dev mode (recompila al cambiar archivo)
- Console logs de artifact visibles en dashboard dev tools
- Stack traces legibles (source maps opcional)

### NFR-004: Mantenibilidad
- Código modular: compilación, carga, render separados
- Tests unitarios para compilador
- Documentación de formato esperado de artifact TSX
- Extensible para soportar más formatos futuros

## API Contracts

### GET /api/artifacts
```json
{
  "artifacts": [
    {
      "slug": "my-visualization",
      "title": "My Visualization",
      "path": "/docs/artifacts/my-visualization",
      "format": "tsx",
      "type": "generic",
      "modifiedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1
}
```

### GET /api/artifacts/:slug/bundle
**Success (200):**
```javascript
// JavaScript bundle compilado, Content-Type: application/javascript
export default function Component() { ... }
```

**Error (400):**
```json
{
  "error": "COMPILATION_ERROR",
  "message": "Unexpected token at line 5, column 12",
  "line": 5,
  "column": 12
}
```

**Error (404):**
```json
{
  "error": "NOT_FOUND",
  "message": "Artifact not found"
}
```
