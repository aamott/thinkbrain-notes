import { afterEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  invokeNativeCommand,
  NativeCommandError,
  normalizeNativeError
} from "./commands";

afterEach(() => {
  vi.restoreAllMocks();
  invoke.mockReset();
});

describe("native command boundary", () => {
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

/**
 * Every Rust error crosses into the app through `invokeNativeCommand`, which is
 * the only place that knows both the command name and the error. Without a log
 * here, a failure on a device can only be read off the screen — and the
 * `details` chain the Rust side assembles sits behind a collapsed "Technical
 * details" element that a phone user has to tap.
 */
describe("native command failure logging", () => {
  it("logs the command, code, message and details when a command fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    invoke.mockRejectedValueOnce({
      code: "sync.credentials_invalid",
      message: "The username or access token was not accepted.",
      details: "HTTP status 401"
    });

    await expect(invokeNativeCommand("desktop_shell_status")).rejects.toBeInstanceOf(
      NativeCommandError
    );

    expect(logged).toHaveBeenCalledTimes(1);
    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).toContain("desktop_shell_status");
    expect(line).toContain("sync.credentials_invalid");
    expect(line).toContain("The username or access token was not accepted.");
    expect(line).toContain("HTTP status 401");
  });

  /**
   * Android's WebView forwards console output to logcat, but renders object
   * arguments as `[object Object]`. The whole point of this log is to be
   * readable from `adb logcat`, so it has to be one already-formatted string.
   */
  it("logs a single formatted string rather than an object", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    invoke.mockRejectedValueOnce({ code: "sync.remote_unreachable", message: "No connection." });

    await expect(invokeNativeCommand("desktop_shell_status")).rejects.toBeInstanceOf(
      NativeCommandError
    );

    expect(logged.mock.calls[0]).toHaveLength(1);
    expect(typeof logged.mock.calls[0]?.[0]).toBe("string");
  });

  it("still throws the normalized error to the caller", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    invoke.mockRejectedValueOnce({ code: "sync.remote_not_found", message: "Not found." });

    await expect(invokeNativeCommand("desktop_shell_status")).rejects.toMatchObject({
      code: "sync.remote_not_found",
      message: "Not found."
    });
  });

  it("says nothing when a command succeeds", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    invoke.mockResolvedValueOnce({ app_name: "ThinkBrain Notes", shell_version: "0", ready: true });

    await invokeNativeCommand("desktop_shell_status");

    expect(logged).not.toHaveBeenCalled();
  });
});
