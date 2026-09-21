import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { emptyManifest, type ArtifactEntry, type RepoManifest } from "./manifest.js";
import { getRepoId } from "./repo-id.js";

export interface PutResult {
  repoId: string;
  slug: string;
  version: string;
  filePath: string;
}

function baseDir(): string {
  return process.env.ARTIFACT_HOME ?? path.join(homedir(), ".artifact", "store");
}

/** StorageProvider boundary: local-fs today, R2/worker tomorrow. */
export class LocalStore {
  dirFor(cwd: string): { repoId: string; dir: string } {
    const repoId = getRepoId(cwd);
    return { repoId, dir: path.join(baseDir(), repoId) };
  }

  readManifest(repoId: string): RepoManifest {
    const file = path.join(baseDir(), repoId, "manifest.json");
    if (!existsSync(file)) return emptyManifest(repoId);
    try {
      return JSON.parse(readFileSync(file, "utf-8")) as RepoManifest;
    } catch {
      return emptyManifest(repoId);
    }
  }

  put(cwd: string, input: { slug: string; title: string; html: string; type?: ArtifactEntry["type"] }): PutResult {
    const { repoId, dir } = this.dirFor(cwd);
    const slugDir = path.join(dir, input.slug);
    const versionsDir = path.join(slugDir, "versions");
    mkdirSync(versionsDir, { recursive: true });

    const manifest = this.readManifest(repoId);
    const prev = manifest.artifacts[input.slug];
    const nextNum = (prev?.versions.length ?? 0) + 1;
    const version = `v${String(nextNum).padStart(3, "0")}`;
    const sha = createHash("sha256").update(input.html).digest("hex").slice(0, 12);

    writeFileSync(path.join(versionsDir, `${version}.html`), input.html);
    const latestPath = path.join(slugDir, "index.html");
    writeFileSync(latestPath, input.html);
    writeFileSync(
      path.join(slugDir, "meta.json"),
      JSON.stringify({ slug: input.slug, title: input.title, type: input.type ?? "generic", version, sha }, null, 2),
    );

    manifest.artifacts[input.slug] = {
      slug: input.slug,
      title: input.title,
      type: input.type ?? "generic",
      latest: version,
      originBranch: null,
      originWorktree: cwd,
      originCommit: null,
      updatedAt: new Date().toISOString(),
      versions: [...(prev?.versions ?? []), { version, sha, createdAt: new Date().toISOString(), size: input.html.length }],
    };
    manifest.updatedAt = new Date().toISOString();
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

    return { repoId, slug: input.slug, version, filePath: latestPath };
  }

  list(cwd: string): ArtifactEntry[] {
    const { repoId } = this.dirFor(cwd);
    return Object.values(this.readManifest(repoId).artifacts);
  }
}
