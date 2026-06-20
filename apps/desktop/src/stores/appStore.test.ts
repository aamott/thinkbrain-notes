import { beforeEach, describe, expect, it } from "vitest";

import { useAppStore } from "./appStore";

describe("app store scaffold", () => {
  beforeEach(() => {
    useAppStore.setState({
      bootChecks: 0,
      nativeShell: { status: "idle" },
      workspace: { status: "idle" }
    });
  });

  it("records boot check interactions", () => {
    useAppStore.getState().recordBootCheck();

    expect(useAppStore.getState().bootChecks).toBe(1);
  });

  it("tracks native shell readiness", () => {
    useAppStore.getState().setNativeShellChecking();

    expect(useAppStore.getState().nativeShell).toEqual({
      status: "checking"
    });

    useAppStore.getState().setNativeShellReady({
      appName: "Thinkbrain Notes",
      shellVersion: "0.0.0",
      ready: true
    });

    expect(useAppStore.getState().nativeShell).toEqual({
      status: "ready",
      shell: {
        appName: "Thinkbrain Notes",
        shellVersion: "0.0.0",
        ready: true
      }
    });
  });

  it("tracks native shell errors", () => {
    useAppStore.getState().setNativeShellError({
      code: "desktop.native_bridge_error",
      message: "bridge unavailable"
    });

    expect(useAppStore.getState().nativeShell).toEqual({
      status: "error",
      error: {
        code: "desktop.native_bridge_error",
        message: "bridge unavailable"
      }
    });
  });

  it("tracks a ready workspace and file list updates", () => {
    useAppStore.getState().setWorkspaceReady(
      {
        rootPath: "C:/notes",
        name: "notes"
      },
      [
        {
          relativePath: "Inbox.md",
          fileName: "Inbox.md",
          parentPath: "",
          byteSize: 1,
          updatedAt: null
        }
      ]
    );

    useAppStore.getState().setWorkspaceFiles([
      {
        relativePath: "Daily.md",
        fileName: "Daily.md",
        parentPath: "",
        byteSize: 2,
        updatedAt: "123"
      }
    ]);

    expect(useAppStore.getState().workspace).toEqual({
      status: "ready",
      workspace: {
        rootPath: "C:/notes",
        name: "notes"
      },
      files: [
        {
          relativePath: "Daily.md",
          fileName: "Daily.md",
          parentPath: "",
          byteSize: 2,
          updatedAt: "123"
        }
      ]
    });
  });

  it("tracks workspace errors", () => {
    useAppStore.getState().setWorkspaceError({
      code: "workspace.open_failed",
      message: "Failed to open the workspace folder."
    });

    expect(useAppStore.getState().workspace).toEqual({
      status: "error",
      error: {
        code: "workspace.open_failed",
        message: "Failed to open the workspace folder."
      }
    });
  });
});
