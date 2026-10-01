/** Storage format of the artifact bytes. Mirrors the store package contract. */
export type ArtifactFormat = 'html' | 'md' | 'mdx';

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

// --- Remote broker wire contracts (additive; local contracts unchanged) ---

export type RemoteStatus = "online" | "offline";

/** Public project entry: no absolute filesystem path. */
export interface PublicProjectEntry {
  projectId: string;
  name: string;
  addedAt: string;
}

/** Artifact over the wire: no absolute path, ISO date strings. */
export interface ArtifactWire {
  slug: string;
  title: string;
  relativePath: string;
  type: Artifact["type"];
  format: ArtifactFormat;
  createdAt: string;
  modifiedAt: string;
  size: number;
}

export interface RemoteCatalogProject {
  project: PublicProjectEntry;
  totalCount: number;
  artifacts: ArtifactWire[];
}

export interface RemoteCatalog {
  generatedAt: string;
  projects: RemoteCatalogProject[];
}

export interface StoredRemoteEntry {
  remoteId: string;
  name: string;
  baseUrl: string;
  version: string;
  agentStartedAt: string;
  lastSeenAt: string;
  catalog: RemoteCatalog;
}

export interface RemoteSummary {
  remoteId: string;
  name: string;
  version: string;
  status: RemoteStatus;
  lastSeenAt: string;
  projectCount: number;
  artifactCount: number;
}

export interface RemoteOverviewGroup {
  remote: RemoteSummary;
  projects: RemoteCatalogProject[];
}

export interface RemoteRegistrationRequest {
  remoteId: string;
  name: string;
  baseUrl: string;
  version: string;
  startedAt: string;
  catalog: RemoteCatalog;
}

export interface RemoteHeartbeatRequest {
  version: string;
  startedAt: string;
  catalog: RemoteCatalog;
}

export interface AgentDaemonInfo {
  remoteId: string;
  brokerUrl: string;
  host: string;
  port: number;
  pid: number;
  startedAt: string;
}

export interface BrokerDaemonInfo {
  port: number;
  host: string;
  pid: number;
  startedAt: string;
}
