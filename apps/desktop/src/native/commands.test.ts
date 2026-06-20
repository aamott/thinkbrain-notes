import { describe, expect, it } from "vitest";

import {
  getDesktopShellStatus,
  NativeCommandError,
  normalizeNativeError
} from "./commands";

describe("native command boundary", () => {
  it("maps native shell status into frontend naming", async () => {
    await expect(
      getDesktopShellStatus(async () => ({
        app_name: "Thinkbrain Notes",
        shell_version: "0.0.0",
        ready: true
      }))
    ).resolves.toEqual({
      appName: "Thinkbrain Notes",
      shellVersion: "0.0.0",
      ready: true
    });
  });

  it("preserves Rust-shaped native errors", () => {
    const error = normalizeNativeError({
      code: "desktop.example",
      message: "Example failure",
      details: "extra context"
    });

    expect(error).toBeInstanceOf(NativeCommandError);
    expect(error).toMatchObject({
      code: "desktop.example",
      message: "Example failure",
      details: "extra context"
    });
  });

  it("normalizes bridge failures into native command errors", () => {
    const error = normalizeNativeError(new Error("bridge unavailable"));

    expect(error).toMatchObject({
      code: "desktop.native_bridge_error",
      message: "bridge unavailable"
    });
  });
});
