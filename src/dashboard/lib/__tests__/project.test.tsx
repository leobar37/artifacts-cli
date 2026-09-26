// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  parseDashboardRoute,
  remoteUrl,
  remoteProjectUrl,
  remoteApiUrl,
  previewUrl,
  eventsUrl,
  projectBase,
  apiUrl,
  getProjectIdFromPath,
} from "../project.js";

describe("dashboard routes (dual local/broker)", () => {
  it("parses local routes exactly as before", () => {
    expect(parseDashboardRoute("/")).toEqual({ mode: "root", remoteId: null, projectId: null });
    expect(parseDashboardRoute("/p/abc123/")).toEqual({ mode: "local", remoteId: null, projectId: "abc123" });
    expect(getProjectIdFromPath("/p/abc123/")).toBe("abc123");
    expect(getProjectIdFromPath("/")).toBeNull();
    expect(projectBase("abc123")).toBe("/p/abc123");
    expect(apiUrl("/artifacts", "abc123")).toBe("/p/abc123/api/artifacts");
  });

  it("parses canonical broker routes", () => {
    expect(parseDashboardRoute("/r/remote-1/")).toEqual({ mode: "remote", remoteId: "remote-1", projectId: null });
    expect(parseDashboardRoute("/r/remote-1")).toEqual({ mode: "remote", remoteId: "remote-1", projectId: null });
    expect(parseDashboardRoute("/r/remote-1/p/proj-9/")).toEqual({ mode: "remote", remoteId: "remote-1", projectId: "proj-9" });
    expect(parseDashboardRoute("/r/a%20b/p/c%2Fd/")).toEqual({ mode: "remote", remoteId: "a b", projectId: "c/d" });
  });

  it("builds encoded remote-qualified URLs from the single source", () => {
    expect(remoteUrl("r1")).toBe("/r/r1/");
    expect(remoteProjectUrl("r 1", "p/2")).toBe("/r/r%201/p/p%2F2/");
    expect(remoteApiUrl("r1", "p1", "/artifacts")).toBe("/r/r1/p/p1/api/artifacts");
    expect(previewUrl("r1", "p1", "demo", "?v=2")).toBe("/r/r1/p/p1/artifacts/demo/index.html?v=2");
    expect(eventsUrl("r1", "p1")).toBe("/r/r1/p/p1/api/events");
  });
});
