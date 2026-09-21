import { describe, it, expect, beforeEach } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import { CompilationService } from "../compiler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, "fixtures");

describe("CompilationService", () => {
  let service: CompilationService;

  beforeEach(() => {
    service = new CompilationService();
  });

  describe("compile TSX", () => {
    it("should compile valid TSX to ESM", async () => {
      const result = await service.compile({
        filePath: path.join(fixturesDir, "valid-component.tsx"),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.code).toContain("function ValidComponent");
        expect(result.code).toContain("Hello World");
      }
    });

    it("should handle JSX syntax with createElement (no bare imports)", async () => {
      const result = await service.compile({
        filePath: path.join(fixturesDir, "valid-component.tsx"),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.code).toContain("React.createElement");
        expect(result.code).not.toMatch(/from\s+["']react\/jsx-runtime["']/);
      }
    });

    it("should inject React global via banner", async () => {
      const result = await service.compile({
        filePath: path.join(fixturesDir, "valid-component.tsx"),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.code).toContain("window.__ARTIFACT_REACT__");
      }
    });

    it("should support hooks", async () => {
      const result = await service.compile({
        filePath: path.join(fixturesDir, "component-with-hooks.tsx"),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.code).toContain("useState");
        expect(result.code).toContain("Counter");
      }
    });
  });

  describe("error handling", () => {
    it("should return error for syntax errors", async () => {
      const result = await service.compile({
        filePath: path.join(fixturesDir, "syntax-error.tsx"),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("COMPILATION_ERROR");
        expect(result.message).toBeTruthy();
      }
    });

    it("should include line info in errors", async () => {
      const result = await service.compile({
        filePath: path.join(fixturesDir, "syntax-error.tsx"),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.line).toBeDefined();
      }
    });

    it("should return error for missing files", async () => {
      const result = await service.compile({
        filePath: path.join(fixturesDir, "nonexistent.tsx"),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("FILE_NOT_FOUND");
      }
    });
  });

  describe("cache", () => {
    it("should cache compiled output", async () => {
      const filePath = path.join(fixturesDir, "valid-component.tsx");

      const first = await service.compile({ filePath });
      const second = await service.compile({ filePath });

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);

      if (first.success && second.success) {
        expect(first.code).toBe(second.code);
      }
    });

    it("should bypass cache when cache=false", async () => {
      const filePath = path.join(fixturesDir, "valid-component.tsx");

      const first = await service.compile({ filePath, cache: false });
      const second = await service.compile({ filePath, cache: false });

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
    });

    it("should invalidate cache", async () => {
      const filePath = path.join(fixturesDir, "valid-component.tsx");

      await service.compile({ filePath });
      service.invalidate(filePath);

      // Should recompile (no crash)
      const result = await service.compile({ filePath });
      expect(result.success).toBe(true);
    });
  });
});
