import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalDir, getProjectId } from "../project.js";

describe("project identity", () => {
  it("resolves symlinked and redundant paths to one id", () => {
    const dir = mkdtempSync(join(tmpdir(), "artifact-ident-"));
    try {
      const plain = getProjectId(dir);
      // dot segments, trailing slash, and tmpdir symlinks (/tmp -> /private/tmp)
      // must all map to the same project
      expect(getProjectId(join(dir, ".", "sub", ".."))).toBe(plain);
      expect(getProjectId(`${dir}/`)).toBe(plain);
      expect(canonicalDir(dir)).toBe(canonicalDir(`${dir}/`));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
