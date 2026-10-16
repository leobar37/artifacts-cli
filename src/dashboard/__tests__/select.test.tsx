// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";
import { ProjectDashboard } from "../App.js";
import type { Artifact, ProjectEntry } from "../../types/artifact.js";

vi.mock("../hooks/useArtifacts.js", () => ({
  useArtifacts: () => ({
    artifacts: listedArtifacts,
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
let listedArtifacts = ARTIFACTS;
beforeEach(() => { listedArtifacts = ARTIFACTS; });

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
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
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
    expect(new URLSearchParams(window.location.search).get("select")).toBe("second");
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

  it("keeps the incoming selection while artifacts load asynchronously", async () => {
    stubBrowserApis();
    go("/p/p1/?select=second");
    listedArtifacts = [];
    const view = render(<ProjectDashboard project={PROJECT} projects={[PROJECT]} />);
    expect(document.querySelector("iframe")).toBeNull();
    expect(window.location.search).toBe("?select=second");
    listedArtifacts = ARTIFACTS;
    view.rerender(<ProjectDashboard project={PROJECT} projects={[PROJECT]} />);
    await waitFor(() => expect(document.querySelector("iframe")?.getAttribute("src")).toContain("/artifacts/second/"));
    expect(window.location.search).toBe("?select=second");
  });

  it("writes sidebar selection into a shareable URL and restores it after remount", async () => {
    stubBrowserApis();
    go("/p/p1/?view=compact#details");
    window.history.replaceState({ marker: "keep" }, "", window.location.href);
    const view = render(<ProjectDashboard project={PROJECT} projects={[PROJECT]} />);
    fireEvent.click(screen.getByRole("button", { name: "Second" }));
    expect(new URLSearchParams(window.location.search).get("select")).toBe("second");
    expect(new URLSearchParams(window.location.search).get("view")).toBe("compact");
    expect(window.location.hash).toBe("#details");
    expect(window.history.state).toEqual({ marker: "keep" });
    view.unmount();
    render(<ProjectDashboard project={PROJECT} projects={[PROJECT]} />);
    await waitFor(() => expect(document.querySelector("iframe")?.getAttribute("src")).toContain("/artifacts/second/"));
  });

  it("tracks browser Back and Forward without reloading the project", async () => {
    stubBrowserApis();
    go("/p/p1/?select=first");
    render(<ProjectDashboard project={PROJECT} projects={[PROJECT]} />);
    const initialFrame = document.querySelector("iframe");
    fireEvent.click(screen.getByRole("button", { name: "Second" }));
    // Reusing an iframe would append its src changes to the browser's joint history.
    expect(document.querySelector("iframe")).not.toBe(initialFrame);
    await act(async () => {
      const changed = new Promise<void>((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));
      window.history.back();
      await changed;
    });
    expect(document.querySelector("iframe")?.getAttribute("src")).toContain("/artifacts/first/");
    await act(async () => {
      const changed = new Promise<void>((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));
      window.history.forward();
      await changed;
    });
    expect(document.querySelector("iframe")?.getAttribute("src")).toContain("/artifacts/second/");
  });

  it("does not create duplicate history entries for the same artifact", () => {
    stubBrowserApis();
    go("/p/p1/?select=second");
    const pushed = vi.spyOn(window.history, "pushState");
    render(<ProjectDashboard project={PROJECT} projects={[PROJECT]} />);
    fireEvent.click(screen.getByRole("button", { name: "Second" }));
    expect(pushed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "First" }));
    fireEvent.click(screen.getByRole("button", { name: "First" }));
    expect(pushed).toHaveBeenCalledTimes(1);
  });

  it("clears the URL selection when closing preview and does not reopen it on rerender", () => {
    stubBrowserApis();
    go("/p/p1/?select=second&view=compact#details");
    const view = render(<ProjectDashboard project={PROJECT} projects={[PROJECT]} />);
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(new URLSearchParams(window.location.search).has("select")).toBe(false);
    expect(new URLSearchParams(window.location.search).get("view")).toBe("compact");
    expect(window.location.hash).toBe("#details");
    view.rerender(<ProjectDashboard project={PROJECT} projects={[PROJECT]} />);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("encodes and restores artifact slugs with spaces, accents and query characters", () => {
    stubBrowserApis();
    const special = { ...ARTIFACTS[0], slug: "café & guía", title: "Special" };
    listedArtifacts = [special];
    go("/p/p1/");
    const view = render(<ProjectDashboard project={PROJECT} projects={[PROJECT]} />);
    fireEvent.click(screen.getByRole("button", { name: "Special" }));
    expect(new URLSearchParams(window.location.search).get("select")).toBe(special.slug);
    const url = window.location.href;
    view.unmount();
    go(url);
    render(<ProjectDashboard project={PROJECT} projects={[PROJECT]} />);
    expect(screen.getByRole("button", { name: "Special" }).getAttribute("aria-pressed")).toBe("true");
  });
});
