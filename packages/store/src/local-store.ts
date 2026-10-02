import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { emptyManifest, type ArtifactEntry, type ArtifactFormat, type RepoManifest } from "./manifest.js";
import type { ArtifactContent, AssetPutResult, PutInput, PutResult, StorageProvider } from "./provider.js";
import { getRepoId } from "./repo-id.js";

function baseDir(): string {
  return process.env.ARTIFACT_HOME ?? path.join(homedir(), ".artifact", "store");
}

/** File extension for each storage format (also the docs symlink name). */
function formatExt(format: ArtifactFormat): ".html" | ".md" | ".mdx" {
  return format === "md" ? ".md" : format === "mdx" ? ".mdx" : ".html";
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
    const format = entry.format ?? "html";
    const file = path.join(dir, slug, "versions", `${version}${formatExt(format)}`);
    if (!existsSync(file)) return null;
    const found = entry.versions.find((v) => v.version === version)!;
    return { slug, title: entry.title, type: entry.type, format, version, sha: found.sha, content: readFileSync(file, "utf-8") };
  }

  /**
   * Point docs/artifacts/<slug>/index.<ext> at the store latest.
   * The agent and dashboard keep reading a plain file; the store stays canonical.
   * Links of other formats are removed so a format switch never leaves a
   * stale twin the scanner would keep listing.
   * Best-effort: a failed link never fails the put.
   */
  linkLatest(cwd: string, slug: string, latestPath: string, format: ArtifactFormat): void {
    try {
      const docsDir = path.join(cwd, "docs", "artifacts", slug);
      mkdirSync(docsDir, { recursive: true });
      for (const ext of [".html", ".md", ".mdx"] as const) {
        const docsFile = path.join(docsDir, `index${ext}`);
        try {
          if (existsSync(docsFile) || lstatSync(docsFile, { throwIfNoEntry: false })) unlinkSync(docsFile);
        } catch {
          return;
        }
      }
      symlinkSync(latestPath, path.join(docsDir, `index${formatExt(format)}`));
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
    // Omitted format keeps the previous one; pre-format entries read as html.
    const format = input.format ?? prev?.format ?? "html";
    const nextNum = (prev?.versions.length ?? 0) + 1;
    const version = `v${String(nextNum).padStart(3, "0")}`;
    const sha = createHash("sha256").update(input.content).digest("hex").slice(0, 12);

    writeFileSync(path.join(versionsDir, `${version}${formatExt(format)}`), input.content);
    const latestPath = path.join(slugDir, `index${formatExt(format)}`);
    writeFileSync(latestPath, input.content);
    writeFileSync(
      path.join(slugDir, "meta.json"),
      JSON.stringify({ slug: input.slug, title: input.title, type: input.type ?? "generic", format, version, sha }, null, 2),
    );

    manifest.artifacts[input.slug] = {
      slug: input.slug,
      title: input.title,
      type: input.type ?? "generic",
      format,
      latest: version,
      originBranch: null,
      originWorktree: cwd,
      originCommit: null,
      updatedAt: new Date().toISOString(),
      versions: [...(prev?.versions ?? []), { version, sha, createdAt: new Date().toISOString(), size: input.content.length }],
    };
    manifest.updatedAt = new Date().toISOString();
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

    this.linkLatest(cwd, input.slug, latestPath, format);

    return { repoId, slug: input.slug, version, filePath: latestPath };
  }

  /**
   * Sibling asset (image/svg/html/md…) for an existing artifact: bytes live in
   * the store next to the entry file, docs gets a symlink — same pattern as
   * index.<ext>. Assets are stable by name (overwrites allowed, not versioned).
   * `name` is an artifact-relative subpath: "logo.svg", "shots/01.png".
   */
  putAsset(cwd: string, slug: string, name: string, content: Buffer): AssetPutResult {
    const { repoId, dir } = this.dirFor(cwd);
    const manifest = this.readManifest(repoId);
    if (!manifest.artifacts[slug]) {
      throw new Error(`NOT_FOUND ${slug}: create the artifact (artifact_create) before adding assets`);
    }
    const segments = name.split("/").filter((s) => s.length > 0);
    if (segments.length === 0 || segments.some((s) => s === "." || s === ".." || s.includes("\\") || s.includes("\0"))) {
      throw new Error(`Invalid asset name "${name}": use relative paths like "logo.svg" or "shots/01.png"`);
    }
    const assetPath = path.join(dir, slug, "assets", ...segments);
    mkdirSync(path.dirname(assetPath), { recursive: true });
    writeFileSync(assetPath, content);

    // docs symlink so the dashboard serves it under /artifacts/<slug>/<name>
    const docsFile = path.join(cwd, "docs", "artifacts", slug, ...segments);
    try {
      mkdirSync(path.dirname(docsFile), { recursive: true });
      if (existsSync(docsFile) || lstatSync(docsFile, { throwIfNoEntry: false })) unlinkSync(docsFile);
      symlinkSync(assetPath, docsFile);
    } catch {
      // Best-effort like linkLatest: the store copy remains canonical.
    }
    return { repoId, slug, name, filePath: docsFile };
  }

  list(cwd: string): ArtifactEntry[] {
    const { repoId } = this.dirFor(cwd);
    return Object.values(this.readManifest(repoId).artifacts);
  }
}
