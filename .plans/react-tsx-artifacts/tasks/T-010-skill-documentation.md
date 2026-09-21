# T-010: Documentación del Skill

## Objetivo
Actualizar skill `artifact-base` para documentar formato TSX.

## Requisitos Relacionados
- NFR-004: Mantenibilidad

## Archivos a Crear/Modificar

### Modificar
- `~/.factory/skills/artifact-base/SKILL.md` - Agregar sección TSX

## Detalles de Implementación

### Sección a Agregar al Skill

```markdown
## TSX Artifacts (Nuevo)

Para crear artifacts React dinámicos que se renderizan en el dashboard:

### Estructura
```
docs/artifacts/[slug]/
  └── content.tsx    # Componente React principal
```

### Formato del Componente

```typescript
// content.tsx
// No necesitas importar React (JSX transform automático)
// Puedes usar hooks de React
import { useState, useEffect } from 'react';

export default function MyArtifact() {
  const [data, setData] = useState([]);
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Título</h1>
      {/* Tu contenido aquí */}
    </div>
  );
}
```

### Hooks Disponibles

- useState, useEffect, useRef, useMemo, useCallback
- useReducer, useContext (con limitaciones)
- Custom hooks definidos en el mismo archivo

### Styling

- Tailwind CSS está disponible automáticamente
- Usa las mismas clases que el dashboard
- Responsive design funciona igual

### Limitaciones

- No soporta imports de librerías externas
- No persiste estado entre navegaciones
- Solo export default (no named exports)
```

## Criterios de Aceptación

- [ ] Skill documenta formato TSX
- [ ] Ejemplos de código claros
- [ ] Limitaciones documentadas
- [ ] Guía de migración desde HTML artifacts

## Pasos de Verificación

1. Leer skill actual
2. Agregar sección de TSX
3. Verificar ejemplos funcionan
