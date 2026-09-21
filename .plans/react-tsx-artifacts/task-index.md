# Índice de Tareas: Artifacts React con Carga Dinámica

## Resumen
Plan para habilitar carga dinámica de componentes React (TSX) en el artifact dashboard, permitiendo al agente escribir código React directamente.

## Tareas

### Fase 1: Infraestructura de Compilación

#### T-001: Setup del Servicio de Compilación
**Descripción:** Crear servicio Express que compile TSX on-the-fly usando esbuild.
**Requisitos:** FR-002, NFR-001
**Archivos:** `src/server/services/compiler.ts`, `src/server/routes/artifacts.ts`
**Dependencias:** Ninguna
**Esfuerzo:** Medio

#### T-002: Cache de Compilación
**Descripción:** Implementar sistema de cache en memory para artifacts compilados.
**Requisitos:** FR-002, NFR-001
**Archivos:** `src/server/services/compiler.ts`
**Dependencias:** T-001
**Esfuerzo:** Bajo

### Fase 2: Detección y API

#### T-003: Extensión de Tipos y API
**Descripción:** Actualizar tipos Artifact y endpoint `/api/artifacts` para incluir campo `format`.
**Requisitos:** FR-001, FR-008
**Archivos:** `src/types/artifact.ts`, `src/server/handlers/*.ts`, `src/dashboard/hooks/useArtifacts.ts`
**Dependencias:** Ninguna
**Esfuerzo:** Bajo

### Fase 3: Dashboard - Carga Dinámica

#### T-004: Dashboard Dynamic Component Renderer
**Descripción:** Crear componente `ArtifactRenderer` que cargue dinámicamente componentes TSX con Suspense y error boundaries.
**Requisitos:** FR-003, FR-004, FR-007
**Archivos:** `src/dashboard/components/ArtifactRenderer.tsx`, `src/dashboard/components/ArtifactViewer.tsx`
**Dependencias:** T-003
**Esfuerzo:** Alto

#### T-005: Module Loader Utility
**Descripción:** Crear hook `useDynamicArtifact` que maneja import() dinámico, cache invalidation, y error handling.
**Requisivos:** FR-003, NFR-003
**Archivos:** `src/dashboard/hooks/useDynamicArtifact.ts`
**Dependencias:** T-004
**Esfuerzo:** Medio

### Fase 4: Integración

#### T-006: Integración ArtifactViewer
**Descripción:** Actualizar ArtifactViewer para detectar formato y usar renderer correcto (TSX vs HTML).
**Requisitos:** FR-004, FR-008
**Archivos:** `src/dashboard/components/ArtifactViewer.tsx`
**Dependencias:** T-004, T-005
**Esfuerzo:** Medio

#### T-007: Error Boundaries
**Descripción:** Implementar error boundaries robustos con UI de recuperación.
**Requisitos:** FR-007
**Archivos:** `src/dashboard/components/ArtifactErrorBoundary.tsx`
**Dependencias:** T-004
**Esfuerzo:** Bajo

### Fase 5: Testing y Validación

#### T-008: Test del Compilador
**Descripción:** Tests unitarios para el servicio de compilación.
**Requisitos:** NFR-004
**Archivos:** Tests nuevos
**Dependencias:** T-001, T-002
**Esfuerzo:** Medio

#### T-009: Testing de Integración
**Descripción:** Probar flujo completo: crear TSX, compilar, renderizar en dashboard.
**Requisitos:** FR-003, FR-006
**Archivos:** Scripts de test o artifacts de ejemplo
**Dependencias:** T-006
**Esfuerzo:** Medio

### Fase 6: Documentación

#### T-010: Documentación del Skill
**Descripción:** Actualizar skill `artifact-base` para documentar formato TSX.
**Requisitos:** NFR-004
**Archivos:** `~/.factory/skills/artifact-base/SKILL.md`
**Dependencias:** T-009
**Esfuerzo:** Bajo

## Dependencias entre Fases

```
Fase 1 (Compilación)
    │
    ↓
Fase 2 (API) ───────────────┐
    │                        │
    ↓                        ↓
Fase 3 (Dashboard Renderer) │
    │                        │
    ↓                        ↓
Fase 4 (Integración) ◄───────┘
    │
    ↓
Fase 5 (Testing)
    │
    ↓
Fase 6 (Docs)
```

## Checklist CLI Usage

```bash
# Listar todas las tareas
node ./planner-checklist.js list react-tsx-artifacts

# Ver tareas pendientes
node ./planner-checklist.js remaining react-tsx-artifacts

# Ver siguiente tarea ejecutable
node ./planner-checklist.js next react-tsx-artifacts

# Marcar tarea en progreso
node ./planner-checklist.js start react-tsx-artifacts T-004

# Marcar tarea completada
node ./planner-checklist.js complete react-tsx-artifacts T-004
```
