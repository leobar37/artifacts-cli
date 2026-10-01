export type ArtifactType = "generic" | "study" | "wireframe";

/** Storage format of the artifact bytes. `html` is the legacy default. */
export type ArtifactFormat = "html" | "md" | "mdx";

export interface ArtifactVersion {
  version: string;
  sha: string;
  createdAt: string;
  size: number;
}

export interface ArtifactEntry {
  slug: string;
  title: string;
  type: ArtifactType;
  /** Absent in pre-format manifests: read as "html". */
  format?: ArtifactFormat;
  latest: string;
  originBranch: string | null;
  originWorktree: string | null;
  originCommit: string | null;
  updatedAt: string;
  versions: ArtifactVersion[];
}

export interface RepoManifest {
  repoId: string;
  updatedAt: string;
  artifacts: Record<string, ArtifactEntry>;
}

export function emptyManifest(repoId: string): RepoManifest {
  return { repoId, updatedAt: new Date().toISOString(), artifacts: {} };
}
