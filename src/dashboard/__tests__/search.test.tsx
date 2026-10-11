// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { ProjectDashboard } from "../App.js";
import { Overview } from "../components/Overview.js";
import { Header } from "../components/Header.js";
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

vi.mock("../hooks/useOverview.js", () => ({
  useOverview: () => ({
    groups: [
      { project: PROJECT_A, totalCount: 2, artifacts: [ARTIFACTS[0], ARTIFACTS[1]] },
      { project: PROJECT_B, totalCount: 1, artifacts: [ARTIFACTS[2]] },
    ],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("../hooks/useTheme.js", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

const ARTIFACTS: Artifact[] = [
  { slug: "codigos", title: "Códigos de descuento", path: "/x/codigos", relativePath: "codigos/index.html", type: "study", format: "html", createdAt: new Date(), modifiedAt: new Date(), size: 10 },
  { slug: "molly-flyers", title: "Molly · Flyers", path: "/x/molly", relativePath: "molly/index.html", type: "study", format: "html", createdAt: new Date(), modifiedAt: new Date(), size: 20 },
  { slug: "release-board", title: "Release board", path: "/x/board", relativePath: "board/index.html", type: "generic", format: "html", createdAt: new Date(), modifiedAt: new Date(), size: 30 },
];

const PROJECT: ProjectEntry = { projectId: "p1", projectPath: "/x/demo", name: "demo", addedAt: new Date().toISOString() };
const PROJECT_A: ProjectEntry = { projectId: "pa", projectPath: "/x/a", name: "alpha", addedAt: new Date().toISOString() };
const PROJECT_B: ProjectEntry = { projectId: "pb", projectPath: "/x/b", name: "beta", addedAt: new Date().toISOString() };

function stubBrowserApis() {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal("EventSource", class { addEventListener() {} onerror: unknown; close() {} });
  vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({}) }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function searchBox(name: string): HTMLInputElement {
  const input = document.querySelector(`input[aria-label="${name}"]`);
  expect(input).not.toBeNull();
  return input as HTMLInputElement;
}

describe("ProjectDashboard search", () => {
  it("filters the sidebar by title, accent-insensitively", () => {
    stubBrowserApis();
    window.history.replaceState(null, "", "/p/p1/");
    render(<ProjectDashboard project={PROJECT} projects={[PROJECT]} />);

    const body = () => document.body.textContent ?? "";
    expect(body()).toContain("Release board");

    fireEvent.change(searchBox("Search artifacts"), { target: { value: "codigos" } });
    expect(body()).toContain("Códigos de descuento");
    expect(body()).not.toContain("Release board");
    expect(body()).not.toContain("Molly · Flyers");
    expect(body()).toContain("1 of 3 artifacts");
  });

  it("shows a match empty state and recovers on clear", () => {
    stubBrowserApis();
    window.history.replaceState(null, "", "/p/p1/");
    render(<ProjectDashboard project={PROJECT} projects={[PROJECT]} />);

    fireEvent.change(searchBox("Search artifacts"), { target: { value: "zzz-no-match" } });
    expect(document.body.textContent).toContain("No matches");

    fireEvent.click(document.querySelector('button[aria-label="Clear search"]')!);
    expect(document.body.textContent).toContain("Release board");
  });
});

describe("Overview search", () => {
  it("filters across projects and hides empty groups", () => {
    stubBrowserApis();
    render(<Overview />);

    const body = () => document.body.textContent ?? "";
    expect(body()).toContain("alpha");
    expect(body()).toContain("beta");

    fireEvent.change(searchBox("Search all artifacts"), { target: { value: "molly" } });
    expect(body()).toContain("alpha");
    expect(body()).not.toContain("beta");
    expect(body()).toContain("Molly · Flyers");
    expect(body()).not.toContain("Release board");
  });
});

describe("Header back navigation", () => {
  it("renders the back link when backHref is provided", () => {
    stubBrowserApis();
    render(
      <Header
        total={3}
        onRefresh={() => {}}
        isLoading={false}
        selectedType="all"
        onSelectType={() => {}}
        projectId="p1"
        projects={[PROJECT]}
        projectName="demo"
        remoteName="elena"
        backHref="/"
        backLabel="All remotes"
      />,
    );
    const link = document.querySelector('a[href="/"]');
    expect(link?.textContent).toContain("All remotes");
  });
});
