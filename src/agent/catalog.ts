import { existsSync } from "fs";
import { listProjects } from "../utils/projects.js";
import { getProjectArtifactsPath } from "../utils/project.js";
import { scanArtifacts } from "../utils/scanner.js";
import type { ArtifactWire, PublicProjectEntry, RemoteCatalog, RemoteCatalogProject } from "../types/artifact.js";

/**
 * Build a sanitized catalog snapshot independently of any server-instance
 * cache. Strips projectPath, absolute artifact paths, and agent endpoints.
 * A project whose artifact dir cannot be read stays in the catalog with zero
 * artifacts instead of aborting the heartbeat.
 */
export function buildRemoteCatalog(): RemoteCatalog {
  const generatedAt = new Date().toISOString();
  const projects: RemoteCatalogProject[] = listProjects().map((entry) => {
    const project: PublicProjectEntry = {
      projectId: entry.projectId,
      name: entry.name,
      addedAt: entry.addedAt,
    };
    let artifacts: ArtifactWire[] = [];
    try {
      const dir = getProjectArtifactsPath(entry.projectPath);
      if (!existsSync(dir)) {
        return { project, totalCount: 0, artifacts: [] };
      }
      const index = scanArtifacts(dir);
      artifacts = index.artifacts.map((a) => ({
        slug: a.slug,
        title: a.title,
        relativePath: a.relativePath,
        type: a.type,
        format: a.format,
        createdAt: toIso(a.createdAt),
        modifiedAt: toIso(a.modifiedAt),
        size: a.size,
      }));
    } catch {
      artifacts = [];
    }
    return { project, totalCount: artifacts.length, artifacts };
  });
  return { generatedAt, projects };
}

function toIso(d: Date | string): string {
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  const t = Date.parse(d);
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}
