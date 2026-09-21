import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { emptyManifest, type ArtifactEntry, type RepoManifest } from "./manifest.js";
import type { ArtifactContent, PutInput, PutResult, StorageProvider } from "./provider.js";
import { getRepoId } from "./repo-id.js";

function baseDir(): string {
  return process.env.ARTIFACT_HOME ?? path.join(homedir(), ".artifact", "store");
}

/** StorageProvider boundary: local-fs today, R2/worker tomorrow. */
export class LocalStore implements StorageProvider {
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

  get(cwd: string, slug: string): ArtifactContent | null {
    const { repoId } = this.dirFor(cwd);
    const entry = this.readManifest(repoId).artifacts[slug];
    if (!entry) return null;
    return this.getVersion(cwd, slug, entry.latest);
  }

  getVersion(cwd: string, slug: string, version: string): ArtifactContent | null {
    const { repoId, dir } = this.dirFor(cwd);
    const entry = this.readManifest(repoId).artifacts[slug];
    if (!entry || !entry.versions.some((v) => v.version === version)) return null;
    const file = path.join(dir, slug, "versions", `${version}.html`);
    if (!existsSync(file)) return null;
    const found = entry.versions.find((v) => v.version === version)!;
    return { slug, title: entry.title, type: entry.type, version, sha: found.sha, html: readFileSync(file, "utf-8") };
  }

  /**
   * Point docs/artifacts/<slug>/index.html at the store latest.
   * The agent and dashboard keep reading a plain file; the store stays canonical.
   * Best-effort: a failed link never fails the put.
   */
  linkLatest(cwd: string, slug: string, latestPath: string): void {
    try {
      const docsFile = path.join(cwd, "docs", "artifacts", slug, "index.html");
      mkdirSync(path.dirname(docsFile), { recursive: true });
      try {
        if (existsSync(docsFile) || lstatSync(docsFile, { throwIfNoEntry: false })) unlinkSync(docsFile);
      } catch {
        return;
      }
      symlinkSync(latestPath, docsFile);
    } catch {
      return;
    }
  }


  put(cwd: string, input: PutInput): PutResult {
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

    this.linkLatest(cwd, input.slug, latestPath);

    return { repoId, slug: input.slug, version, filePath: latestPath };
  }

  list(cwd: string): ArtifactEntry[] {
    const { repoId } = this.dirFor(cwd);
    return Object.values(this.readManifest(repoId).artifacts);
  }
}
