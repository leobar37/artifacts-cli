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

export interface InstanceLock {
  projectPath: string;
  projectId: string;
  port: number;
  pid: number;
  startedAt: string;
}
