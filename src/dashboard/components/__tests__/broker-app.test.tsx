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
});

describe("BrokerProjectDashboard", () => {
  const ARTIFACTS = OVERVIEW[0].projects[0].artifacts;

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
});
