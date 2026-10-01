// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { ProjectDashboard } from "../App.js";
import type { Artifact, ProjectEntry } from "../../types/artifact.js";

vi.mock("../hooks/useArtifacts.js", () => ({
  useArtifacts: () => ({
    artifacts: ARTIFACTS,
    total: ARTIFACTS.length,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("../hooks/useProject.js", () => ({
  useProject: () => ({ name: "demo", path: "/x/demo", loading: false, error: null }),
}));

vi.mock("../hooks/useTheme.js", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

const ARTIFACTS: Artifact[] = [
  { slug: "first", title: "First", path: "/x/first", relativePath: "first/index.html", type: "generic", format: "html", createdAt: new Date(), modifiedAt: new Date(), size: 10 },
  { slug: "second", title: "Second", path: "/x/second", relativePath: "second/index.html", type: "study", format: "html", createdAt: new Date(), modifiedAt: new Date(), size: 20 },
];

const PROJECT: ProjectEntry = { projectId: "p1", projectPath: "/x/demo", name: "demo", addedAt: new Date().toISOString() };

function stubBrowserApis() {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal("EventSource", class { addEventListener() {} onerror: unknown; close() {} });
  vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({}) }));
}

function go(path: string) {
  window.history.replaceState(null, "", path);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProjectDashboard ?select=", () => {
  it("selects the artifact named in the query", async () => {
    stubBrowserApis();
    go("/p/p1/?select=second");
    render(<ProjectDashboard project={PROJECT} projects={[PROJECT]} />);
    await waitFor(() => {
      const iframe = document.querySelector("iframe");
      expect(iframe?.getAttribute("src")).toContain("/artifacts/second/index.html");
    });
    expect(window.location.search).toBe("");
  });

  it("shows the empty state without a query", async () => {
    stubBrowserApis();
    go("/p/p1/");
    render(<ProjectDashboard project={PROJECT} projects={[PROJECT]} />);
    await waitFor(() => {
      expect(document.body.textContent).toContain("Select an artifact");
    });
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("ignores an unknown slug", async () => {
    stubBrowserApis();
    go("/p/p1/?select=nope");
    render(<ProjectDashboard project={PROJECT} projects={[PROJECT]} />);
    await waitFor(() => {
      expect(document.body.textContent).toContain("Select an artifact");
    });
  });
});
