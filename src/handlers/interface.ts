import type { Artifact, ArtifactIndex } from '../types/artifact.js';

export type { Artifact, ArtifactIndex } from '../types/artifact.js';

export type ArtifactType = 'generic' | 'study' | 'wireframe';

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface ArtifactHandler {
  readonly type: ArtifactType;
  scan(artifactsPath: string): Promise<Artifact[]>;
  list(artifacts: Artifact[]): Artifact[];
  get(slug: string, artifacts: Artifact[]): Artifact | null;
  validate?(html: string): ValidationResult;
  renderHints: Readonly<Record<string, unknown>>;
}
