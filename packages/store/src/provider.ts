import type { ArtifactEntry, ArtifactType, RepoManifest } from "./manifest.js";

export interface ArtifactContent {
  slug: string;
  title: string;
  type: ArtifactType;
  version: string;
  sha: string;
  html: string;
}

export interface PutInput {
  slug: string;
  title: string;
  html: string;
  type?: ArtifactType;
}

export interface PutResult {
  repoId: string;
  slug: string;
  version: string;
  filePath: string;
}

/**
 * Storage strategy boundary. LocalStore implements it today;
 * a cloud (R2/worker) backend implements the same interface tomorrow
 * without touching callers (extension, CLI, protocol handler).
 */
export interface StorageProvider {
  put(cwd: string, input: PutInput): PutResult;
  get(cwd: string, slug: string): ArtifactContent | null;
  getVersion(cwd: string, slug: string, version: string): ArtifactContent | null;
  list(cwd: string): ArtifactEntry[];
  readManifest(repoId: string): RepoManifest;
}
