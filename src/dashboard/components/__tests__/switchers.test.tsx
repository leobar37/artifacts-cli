// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RemoteSwitcher } from "../RemoteSwitcher.js";
import { ProjectSwitcher } from "../ProjectSwitcher.js";
import type { ProjectEntry, RemoteSummary } from "../../../types/artifact.js";

afterEach(() => cleanup());

const REMOTES: RemoteSummary[] = [
  { remoteId: "r-a", name: "ubuntu-dev", version: "v", status: "online", lastSeenAt: new Date().toISOString(), projectCount: 1, artifactCount: 2 },
  { remoteId: "r-b", name: "macbook", version: "v", status: "offline", lastSeenAt: "2026-01-01T00:00:00.000Z", projectCount: 1, artifactCount: 1 },
];

const PROJECTS: ProjectEntry[] = [
  { projectId: "p1", projectPath: "/x/one", name: "one", addedAt: new Date().toISOString() },
  { projectId: "p2", projectPath: "/x/two", name: "two", addedAt: new Date().toISOString() },
];

function mockLocation() {
  let href = "http://localhost:3000/";
  const pathname = "/";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      get href() {
        return href;
      },
      set href(v: string) {
        href = v;
      },
      pathname,
      search: "",
    },
  });
  return () => href;
}

describe("RemoteSwitcher", () => {
  it("shows current remote name with textual status and lists all remotes", () => {
    mockLocation();
    render(<RemoteSwitcher remoteId="r-a" remotes={REMOTES} />);
    expect(screen.getByText("ubuntu-dev")).toBeTruthy();
    expect(screen.getByText("Online")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Switch remote"));
    expect(screen.getByText("macbook")).toBeTruthy();
    expect(screen.getByText(/Offline/)).toBeTruthy();
  });

  it("navigates to the remote-qualified root on select", () => {
    const getHref = mockLocation();
    render(<RemoteSwitcher remoteId="r-a" remotes={REMOTES} />);
    fireEvent.click(screen.getByTitle("Switch remote"));
    fireEvent.click(screen.getByRole("option", { name: /macbook/ }));
    expect(getHref()).toBe("/r/r-b/");
  });
});

describe("ProjectSwitcher (broker-scoped navigation)", () => {
  it("keeps local /p navigation by default", () => {
    const getHref = mockLocation();
    render(<ProjectSwitcher projectId="p1" projects={PROJECTS} />);
    fireEvent.click(screen.getByTitle("Switch project"));
    fireEvent.click(screen.getByRole("option", { name: /two/ }));
    expect(getHref()).toBe("/p/p2/");
  });

  it("uses the navigate override for remote-qualified project URLs", () => {
    const seen: string[] = [];
    render(<ProjectSwitcher projectId="p1" projects={PROJECTS} navigate={(id) => seen.push(`/r/r-a/p/${id}/`)} />);
    fireEvent.click(screen.getByTitle("Switch project"));
    fireEvent.click(screen.getByRole("option", { name: /two/ }));
    expect(seen).toEqual(["/r/r-a/p/p2/"]);
  });

  it("supports keyboard traversal like the remote switcher", () => {
    mockLocation();
    render(<ProjectSwitcher projectId="p1" projects={PROJECTS} />);
    fireEvent.click(screen.getByTitle("Switch project"));
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

void vi;
