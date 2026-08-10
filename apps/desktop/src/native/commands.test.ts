import { describe, expect, it } from "vitest";

import {
  NativeCommandError,
  normalizeNativeError
} from "./commands";

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
