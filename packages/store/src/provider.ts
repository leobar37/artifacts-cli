import type { ArtifactEntry, ArtifactFormat, ArtifactType, RepoManifest } from "./manifest.js";

export interface ArtifactContent {
  slug: string;
  title: string;
  type: ArtifactType;
  format: ArtifactFormat;
  version: string;
  sha: string;
  /** Canonical source text: standalone HTML, Markdown or MDX. */
  content: string;
}

export interface PutInput {
  slug: string;
  title: string;
  /** Source text: standalone HTML, Markdown or MDX. */
  content: string;
  /** Storage format. Omitted = keep the previous one (html for new slugs). */
  format?: ArtifactFormat;
  type?: ArtifactType;
}

export interface PutResult {
  repoId: string;
  slug: string;
  version: string;
  filePath: string;
}

export interface AssetPutResult {
  repoId: string;
  slug: string;
  /** Artifact-relative asset path, e.g. "shots/01.png". */
  name: string;
  /** Docs-visible symlink path (docs/artifacts/<slug>/<name>). */
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
  /** Sibling asset for an existing artifact (images, svg, html, md…). */
  putAsset(cwd: string, slug: string, name: string, content: Buffer): AssetPutResult;
}
