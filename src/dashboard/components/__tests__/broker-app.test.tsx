// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrokerOverview } from "../BrokerOverview.js";
import { BrokerProjectDashboard } from "../../App.js";
import type { RemoteOverviewGroup, RemoteSummary } from "../../../types/artifact.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

function renderWithClient(ui: React.ReactElement) {
  return render(<QueryClientProvider client={client()}>{ui}</QueryClientProvider>);
}

const REMOTE_A: RemoteSummary = {
  remoteId: "r-a", name: "ubuntu-dev", version: "v", status: "online",
  lastSeenAt: new Date().toISOString(), projectCount: 1, artifactCount: 1,
};
const REMOTE_B: RemoteSummary = {
  remoteId: "r-b", name: "macbook", version: "v", status: "offline",
  lastSeenAt: "2026-02-02T00:00:00.000Z", projectCount: 1, artifactCount: 1,
};

const OVERVIEW: RemoteOverviewGroup[] = [
  {
    remote: REMOTE_A,
    projects: [{
      project: { projectId: "p1", name: "shop", addedAt: new Date().toISOString() },
      totalCount: 1,
      artifacts: [{
        slug: "demo", title: "Shop demo", relativePath: "docs/artifacts/demo/index.html",
        type: "study", format: "md", createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), size: 120,
      }],
    }],
  },
  {
    remote: REMOTE_B,
    projects: [{
      project: { projectId: "p1", name: "blog", addedAt: new Date().toISOString() },
      totalCount: 1,
      artifacts: [{
        slug: "hello", title: "Hello", relativePath: "docs/artifacts/hello/index.html",
        type: "generic", format: "html", createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), size: 60,
      }],
    }],
  },
];

beforeEach(() => {
  // This jsdom setup ships a broken global localStorage (node's native
  // web-storage stub shadows it); the theme hook only needs get/set.
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
    if (String(url).endsWith("/api/overview")) {
      return new Response(JSON.stringify({ remotes: OVERVIEW }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
});

describe("BrokerOverview", () => {
  it("renders remote → project → artifact with online/offline text and deep links", async () => {
    renderWithClient(<BrokerOverview />);
    expect(await screen.findByText("ubuntu-dev")).toBeTruthy();
    expect(await screen.findByText("macbook")).toBeTruthy();
    // Textual status is never color-only.
    expect(screen.getAllByText("Online").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Offline").length).toBeGreaterThan(0);
    // Offline remote keeps its stored catalog.
    expect(screen.getByText("Hello")).toBeTruthy();
    // Remote-qualified deep links.
    const anchor = screen.getByText("shop").closest("a");
    expect(anchor?.getAttribute("href")).toBe("/r/r-a/p/p1/");
  });

  it("keeps name-matching empty remotes and projects visible", async () => {
    const emptyRemote: RemoteSummary = {
      remoteId: "r-empty", name: "quiet-server", version: "v", status: "offline",
      lastSeenAt: "2026-10-01T00:00:00.000Z", projectCount: 0, artifactCount: 0,
    };
    const emptyProjectRemote: RemoteSummary = {
      remoteId: "r-project", name: "project-host", version: "v", status: "online",
      lastSeenAt: new Date().toISOString(), projectCount: 1, artifactCount: 0,
    };
    const emptyCatalog: RemoteOverviewGroup[] = [
      { remote: emptyRemote, projects: [] },
      {
        remote: emptyProjectRemote,
        projects: [{
          project: { projectId: "p-empty", name: "quiet-project", addedAt: new Date().toISOString() },
          totalCount: 0,
          artifacts: [],
        }],
      },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ remotes: emptyCatalog }), { status: 200 })));
    renderWithClient(<BrokerOverview />);
    const search = await screen.findByRole("searchbox", { name: "Search servers and projects" });

    fireEvent.change(search, { target: { value: "quiet-server" } });
    expect(await screen.findByText("quiet-server")).toBeTruthy();
    expect(screen.getByText("No projects reported yet.")).toBeTruthy();

    fireEvent.change(search, { target: { value: "quiet-project" } });
    expect(await screen.findByText("quiet-project")).toBeTruthy();
    expect(screen.getByText("No artifacts yet.")).toBeTruthy();
    expect(screen.queryByText("quiet-server")).toBeNull();
  });

  it("searches broker overview by remote, project, and artifact names", async () => {
    renderWithClient(<BrokerOverview />);
    const search = await screen.findByRole("searchbox", { name: "Search servers and projects" });

    fireEvent.change(search, { target: { value: "ubuntu-dev" } });
    expect(await screen.findByText("ubuntu-dev")).toBeTruthy();
    expect(screen.getByText("Shop demo")).toBeTruthy();
    expect(screen.queryByText("macbook")).toBeNull();

    fireEvent.change(search, { target: { value: "blog" } });
    expect(await screen.findByText("blog")).toBeTruthy();
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.queryByText("ubuntu-dev")).toBeNull();

    fireEvent.change(search, { target: { value: "Shop demo" } });
    expect(await screen.findByText("Shop demo")).toBeTruthy();
    expect(screen.queryByText("Hello")).toBeNull();
  });
});

describe("BrokerProjectDashboard", () => {
  const ARTIFACTS = OVERVIEW[0].projects[0].artifacts;
  beforeEach(() => { window.history.replaceState(null, "", "/r/r-a/p/p1/"); });

  function stubProject(data: { error?: string } | { ok: true }) {
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: { method?: string }) => {
      const u = String(url);
      if (u.endsWith("/api/overview")) return new Response(JSON.stringify({ remotes: OVERVIEW }), { status: 200 });
      if (u.endsWith("/api/remotes")) return new Response(JSON.stringify({ remotes: [REMOTE_A, REMOTE_B] }), { status: 200 });
      if (u.includes("/api/artifacts")) {
        if ("error" in data) return new Response(data.error, { status: 500 });
        return new Response(JSON.stringify({ artifacts: ARTIFACTS, totalCount: 1 }), { status: 200 });
      }
      if (u.includes("/api/project")) {
        return new Response(JSON.stringify({ project: { projectId: "p1", name: "shop", addedAt: new Date().toISOString() } }), { status: 200 });
      }
      if (init?.method === "HEAD") return new Response(null, { status: 200 });
      if (u.endsWith("/api/health")) return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      throw new Error(`unexpected fetch ${u}`);
    }));
    vi.stubGlobal("EventSource", class {
      addEventListener() {}
      close() {}
      set onerror(_: unknown) {}
    });
  }

  it("keeps global broker navigation when the scoped request fails", async () => {
    stubProject({ error: "boom" });
    renderWithClient(<BrokerProjectDashboard remote={REMOTE_A} remotes={[REMOTE_A, REMOTE_B]} projectId="p1" />);
    expect(await screen.findByText("Failed to load project")).toBeTruthy();
    // Global shell survives the scoped error.
    expect(screen.getByText("All remotes")).toBeTruthy();
    expect(screen.getAllByText(/ubuntu-dev/).length).toBeGreaterThan(0);
  });

  it("keeps filtered results authoritative after selecting an artifact and links back to all remotes", async () => {
    stubProject({ ok: true });
    renderWithClient(<BrokerProjectDashboard remote={REMOTE_A} remotes={[REMOTE_A, REMOTE_B]} projectId="p1" />);
    fireEvent.click(await screen.findByText("Shop demo"));

    const backLink = screen.getByRole("link", { name: "All remotes" });
    expect(backLink.getAttribute("href")).toBe("/");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search artifacts" }), {
      target: { value: "no-such-artifact" },
    });
    expect(await screen.findByText("No matches")).toBeTruthy();
  });

  it("mobile flow: artifact list → overlay → close returns to the list", async () => {
    stubProject({ ok: true });
    renderWithClient(<BrokerProjectDashboard remote={REMOTE_A} remotes={[REMOTE_A, REMOTE_B]} projectId="p1" />);
    // Sidebar artifact list (mobile drill-down step).
    const card = await screen.findByText("Shop demo");
    fireEvent.click(card);
    // Full-screen preview overlay opens…
    const overlay = await screen.findByRole("button", { name: "Close preview" });
    expect(overlay).toBeTruthy();
    expect(document.querySelector(".mobile-preview-overlay")).toBeTruthy();
    // …and close returns to the artifact list.
    fireEvent.click(overlay);
    await waitFor(() => {
      expect(document.querySelector(".mobile-preview-overlay")).toBeNull();
    });
    expect(screen.getByText("Shop demo")).toBeTruthy();
  });

  it("shows the remote header with textual status", async () => {
    stubProject({ ok: true });
    renderWithClient(<BrokerProjectDashboard remote={REMOTE_A} remotes={[REMOTE_A, REMOTE_B]} projectId="p1" />);
    await screen.findByText("Shop demo");
    const header = document.querySelector("header");
    expect(header?.textContent).toContain("ubuntu-dev");
    expect(header?.textContent).toContain("Online");
  });

  it("preserves a remote-qualified artifact deep link after data loads", async () => {
    stubProject({ ok: true });
    window.history.replaceState({ marker: "keep" }, "", "/r/r-a/p/p1/?view=compact&select=demo#details");
    const view = renderWithClient(<BrokerProjectDashboard remote={REMOTE_A} remotes={[REMOTE_A, REMOTE_B]} projectId="p1" />);
    await screen.findByRole("button", { name: "Shop demo" });
    await waitFor(() => expect(document.querySelector("iframe")?.getAttribute("src")).toContain("/r/r-a/p/p1/artifacts/demo/index.md"));
    expect(window.location.pathname).toBe("/r/r-a/p/p1/");
    expect(window.location.search).toBe("?view=compact&select=demo");
    expect(window.location.hash).toBe("#details");
    expect(window.history.state).toEqual({ marker: "keep" });
    view.unmount();
    renderWithClient(<BrokerProjectDashboard remote={REMOTE_A} remotes={[REMOTE_A, REMOTE_B]} projectId="p1" />);
    await waitFor(() => expect(document.querySelector("iframe")?.getAttribute("src")).toContain("/r/r-a/p/p1/artifacts/demo/index.md"));
  });

  it("updates and clears selection without dropping remote, query or fragment context", async () => {
    stubProject({ ok: true });
    window.history.replaceState(null, "", "/r/r-a/p/p1/?view=compact#details");
    renderWithClient(<BrokerProjectDashboard remote={REMOTE_A} remotes={[REMOTE_A, REMOTE_B]} projectId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Shop demo" }));
    expect(window.location.pathname).toBe("/r/r-a/p/p1/");
    expect(new URLSearchParams(window.location.search).get("select")).toBe("demo");
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(window.location.pathname).toBe("/r/r-a/p/p1/");
    expect(window.location.search).toBe("?view=compact");
    expect(window.location.hash).toBe("#details");
    expect(document.querySelector("iframe")).toBeNull();
  });
});
