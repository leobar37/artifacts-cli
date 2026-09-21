import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

function sh(cmd: string, cwd: string): string | null {
  try {
    return (
      execSync(cmd, { cwd, stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim() || null
    );
  } catch {
    return null;
  }
}

/**
 * Stable repo identity shared by CLI + pi-extension.
 * All worktrees of the same repo resolve to the same id,
 * so `store/<repoId>/` is visible cross-worktree.
 *
 * Order: origin remote (global) -> git-common-dir (local) -> cwd (fallback).
 */
export function getRepoId(cwd: string): string {
  const commonDir = sh("git rev-parse --git-common-dir", cwd);
  const remote = sh("git remote get-url origin", cwd);
  const base =
    remote?.toLowerCase().replace(/\.git$/, "") ?? commonDir ?? cwd;
  return createHash("sha256").update(base).digest("hex").slice(0, 16);
}
