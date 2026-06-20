import { beforeEach, describe, expect, it } from "vitest";

import { useAppStore } from "./appStore";

describe("app store scaffold", () => {
  beforeEach(() => {
    useAppStore.setState({
      bootChecks: 0,
      nativeShell: { status: "idle" }
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
});
