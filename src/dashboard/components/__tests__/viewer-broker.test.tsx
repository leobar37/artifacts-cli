// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { ArtifactViewer } from "../ArtifactViewer.js";
import type { Artifact } from "../../../types/artifact.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ARTIFACT: Artifact = {
  slug: "demo",
  title: "Demo",
  path: "docs/artifacts/demo/index.html",
  relativePath: "docs/artifacts/demo/index.html",
  type: "study",
  createdAt: new Date(),
  modifiedAt: new Date(),
  size: 100,
};

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  listeners = new Map<string, ((e: MessageEvent) => void)[]>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: (e: MessageEvent) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(cb);
    this.listeners.set(type, list);
  }
  close() {}
  set onerror(_: unknown) {}
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});

describe("ArtifactViewer (broker mode)", () => {
  it("renders the offline panel with no iframe and no EventSource", () => {
    render(
      <ArtifactViewer
        artifact={ARTIFACT}
        remote={{
          remoteId: "r-b",
          projectId: "p1",
          remote: {
            remoteId: "r-b", name: "macbook", version: "v", status: "offline",
            lastSeenAt: "2026-02-02T00:00:00.000Z", projectCount: 1, artifactCount: 1,
          },
        }}
      />,
    );
    expect(screen.getByText("Remote offline")).toBeTruthy();
    expect(screen.getByText(/macbook is Offline/)).toBeTruthy();
    expect(screen.getByText(/Last seen 2026-02-02/)).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("uses remote-qualified preview and SSE URLs when online", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: { method?: string }) => {
      if (init?.method === "HEAD") return new Response(null, { status: 200 });
      if (String(url).endsWith("/api/health")) return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      throw new Error(`unexpected fetch ${url}`);
    }));
    render(
      <ArtifactViewer
        artifact={ARTIFACT}
        remote={{
          remoteId: "r-a",
          projectId: "p1",
          remote: {
            remoteId: "r-a", name: "ubuntu-dev", version: "v", status: "online",
            lastSeenAt: new Date().toISOString(), projectCount: 1, artifactCount: 1,
          },
        }}
      />,
    );
    const iframe = (await screen.findByTitle("Demo")) as HTMLIFrameElement;
    expect(iframe.getAttribute("src")).toBe("/r/r-a/p/p1/artifacts/demo/index.html?v=0");
    await waitFor(() => {
      expect(FakeEventSource.instances.map((i) => i.url)).toContain("/r/r-a/p/p1/api/events");
    });
  });

  it("shows a visible error when the daemon is unreachable (timeout path)", async () => {
    // jsdom never fires resource errors on iframes, so exercise the same
    // visible-error state through the deterministic 15s preview timeout
    // using fake timers (no wall-clock wait).
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", vi.fn(async () => {
        throw new Error("down");
      }));
      render(<ArtifactViewer artifact={ARTIFACT} />);
      expect(screen.getByText("Loading preview...")).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });
      expect(screen.getByText("Daemon unreachable")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not restart loading when polls mint a new remote object", async () => {
    // Regression: catalog polls create fresh `remote` objects every 15s.
    // Depending on that identity restarted the spinner forever (and the
    // timeout auto-retry reloaded the iframe in a loop).
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
      const mkRemote = () => ({
        remoteId: "r-a",
        projectId: "p1",
        remote: {
          remoteId: "r-a", name: "ubuntu-dev", version: "v", status: "online" as const,
          lastSeenAt: new Date().toISOString(), projectCount: 1, artifactCount: 1,
        },
      });
      const { rerender } = render(<ArtifactViewer artifact={ARTIFACT} remote={mkRemote()} />);
      const { fireEvent: fire } = await import("@testing-library/react");
      fire.load(screen.getByTitle("Demo"));
      expect(screen.queryByText("Loading preview...")).toBeNull();
      // Poll-like re-render: equal values, fresh object identity.
      rerender(<ArtifactViewer artifact={ARTIFACT} remote={mkRemote()} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(16000);
      });
      expect(screen.queryByText("Loading preview...")).toBeNull();
      expect((screen.getByTitle("Demo") as HTMLIFrameElement).getAttribute("src")).toBe(
        "/r/r-a/p/p1/artifacts/demo/index.html?v=0",
      );
      expect(FakeEventSource.instances).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
