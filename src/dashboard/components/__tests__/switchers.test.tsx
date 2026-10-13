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

  it("shows an honest local-machine state when there is no broker context", () => {
    mockLocation();
    render(<RemoteSwitcher />);
    expect(screen.getByText("This machine")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Switch remote"));
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByText(/Local mode/)).toBeTruthy();
    expect(screen.queryByText("ubuntu-dev")).toBeNull();
  });

  it("searches remotes and navigates with Enter, including offline catalogs", () => {
    const getHref = mockLocation();
    render(<RemoteSwitcher remoteId="r-a" remotes={REMOTES} />);
    fireEvent.click(screen.getByTitle("Switch remote"));
    const search = screen.getByRole("searchbox", { name: "Search remotes" });
    fireEvent.change(search, { target: { value: "macbook" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(search, { key: "Enter" });
    expect(getHref()).toBe("/r/r-b/");
  });

  it("does not label an unknown remote as the first registered machine", () => {
    render(<RemoteSwitcher remoteId="missing" remotes={REMOTES} />);
    expect(screen.getByText("Select remote")).toBeTruthy();
    expect(screen.queryByText("ubuntu-dev")).toBeNull();
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

  it("searches names and paths and keeps keyboard selection remote-qualified", () => {
    const navigate = vi.fn();
    render(<ProjectSwitcher projectId="p1" projects={PROJECTS} navigate={navigate} />);
    fireEvent.click(screen.getByTitle("Switch project"));
    const search = screen.getByRole("searchbox", { name: "Search projects" });
    fireEvent.change(search, { target: { value: "/x/two" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(search, { key: "Enter" });
    expect(navigate).toHaveBeenCalledWith("p2");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("keeps the keyboard highlight after ArrowDown and selects the next project", () => {
    const navigate = vi.fn();
    render(<ProjectSwitcher projectId="p1" projects={PROJECTS} navigate={navigate} />);
    fireEvent.click(screen.getByTitle("Switch project"));
    const search = screen.getByRole("searchbox", { name: "Search projects" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(navigate).toHaveBeenCalledWith("p2");
  });

  it("shows an empty search state without navigating and restores focus on Escape", () => {
    const navigate = vi.fn();
    render(<ProjectSwitcher projectId="p1" projects={PROJECTS} navigate={navigate} />);
    const trigger = screen.getByTitle("Switch project");
    fireEvent.click(trigger);
    const search = screen.getByRole("searchbox", { name: "Search projects" });
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: "missing" } });
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByText(/No projects match/)).toBeTruthy();
    fireEvent.keyDown(search, { key: "Enter" });
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("closes on an outside pointer without changing the project", () => {
    const navigate = vi.fn();
    render(<ProjectSwitcher projectId="p1" projects={PROJECTS} navigate={navigate} />);
    fireEvent.click(screen.getByTitle("Switch project"));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
