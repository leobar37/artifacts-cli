export type ArtifactFormat = 'html' | 'tsx';

export interface Artifact {
  slug: string;
  title: string;
  path: string;
  relativePath: string;
  type: 'generic' | 'study' | 'wireframe' | 'unknown';
  format: ArtifactFormat;
  createdAt: Date;
  modifiedAt: Date;
  size: number;
}

export interface ArtifactIndex {
  artifacts: Artifact[];
  totalCount: number;
  lastScanAt: Date;
}

export interface ProjectEntry {
  projectId: string;
  projectPath: string;
  name: string;
  addedAt: string;
}

export interface DaemonInfo {
  port: number;
  host: string;
  pid: number;
  startedAt: string;
}

/** Hono context for routes mounted under `/p/:projectId`. */
export interface ProjectEnv {
  Variables: {
    project: ProjectEntry;
  };
}
