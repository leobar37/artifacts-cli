# T-003: Extensión de Tipos y API

## Objetivo
Actualizar tipos Artifact y endpoint `/api/artifacts` para incluir campo `format`.

## Requisitos Relacionados
- FR-001: Detección de Tipo de Artifact
- FR-008: Backward Compatibility

## Archivos a Crear/Modificar

### Modificar
- `src/types/artifact.ts` - Agregar campo format
- `src/server/handlers/scan.ts` o scanner - Detectar tipo
- `src/dashboard/hooks/useArtifacts.ts` - Usar nuevo campo
- `src/dashboard/types/artifact.ts` - Sync con server types

## Detalles de Implementación

### Nuevos Tipos

```typescript
// src/types/artifact.ts
export type ArtifactFormat = 'html' | 'tsx';

export interface Artifact {
  slug: string;
  title: string;
  path: string;
  relativePath: string;
  type: 'generic' | 'study' | 'wireframe' | 'unknown';
  format: ArtifactFormat; // NUEVO
  createdAt: Date;
  modifiedAt: Date;
  size: number;
}
```

### Detección de Formato

```typescript
function detectFormat(slug: string): ArtifactFormat {
  const basePath = `docs/artifacts/${slug}`;
  
  // Si existe content.tsx → TSX
  if (existsSync(`${basePath}/content.tsx`)) {
    return 'tsx';
  }
  
  // Si solo existe index.html → HTML
  if (existsSync(`${basePath}/index.html`)) {
    return 'html';
  }
  
  // Default: html (backward compat)
  return 'html';
}
```

### Actualizar Scanner

Modificar la lógica de escaneo para:
1. Detectar si existe `content.tsx` o `index.html`
2. Agregar campo `format` al objeto Artifact
3. Size puede ser: tamaño de content.tsx + index.html (si ambos existen)

## Criterios de Aceptación

- [ ] GET `/api/artifacts` retorna campo `format` para cada artifact
- [ ] Artifacts con `content.tsx` tienen format='tsx'
- [ ] Artifacts con solo `index.html` tienen format='html'
- [ ] Artifacts legacy sin cambios funcionan (format='html' default)
- [ ] Frontend types están sincronizados con backend

## Pasos de Verificación

1. Crear artifact con content.tsx → API retorna format='tsx'
2. Crear artifact con solo index.html → API retorna format='html'
3. Verificar dashboard recibe y usa el campo format
