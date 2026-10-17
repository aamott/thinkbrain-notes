import { afterEach, describe, expect, it, vi } from "vitest";

import { isTauri } from "@tauri-apps/api/core";

import { isApplePlatform, isNativeHost } from "./runtime";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn<() => boolean>()
}));

/** Stubs `navigator` for one call, restoring whatever was there before. */
const realNavigator = globalThis.navigator;

function stubNavigator(ua?: string, platform?: string): void {
  vi.stubGlobal(
    "navigator",
    ua === undefined
      ? undefined
      : { userAgent: ua, platform: platform ?? ua }
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("navigator", realNavigator);
});

describe("isNativeHost", () => {
  it("delegates to Tauri's probe on every call", () => {
    vi.mocked(isTauri).mockReturnValueOnce(false).mockReturnValueOnce(true);

    expect(isNativeHost()).toBe(false);
    expect(isNativeHost()).toBe(true);
    expect(vi.mocked(isTauri)).toHaveBeenCalledTimes(2);
  });
});

describe("isApplePlatform", () => {
  it.each(["Mac", "iPhone", "iPad", "iPod"])("is true on %s user agents", (token) => {
    stubNavigator(`Mozilla/5.0 (${token}; CPU OS 17_0 like Mac OS X)`);
    expect(isApplePlatform()).toBe(true);
  });

  it.each(["Windows NT 10.0", "X11; Linux x86_64", "Linux; Android 14"])(
    "is false on %s user agents",
    (ua) => {
      stubNavigator(`Mozilla/5.0 (${ua})`);
      expect(isApplePlatform()).toBe(false);
    }
  );

  it("is false when navigator does not exist", () => {
    stubNavigator(undefined);
    expect(isApplePlatform()).toBe(false);
  });

  it("falls back to navigator.platform when the user agent is empty", () => {
    stubNavigator("", "MacIntel");
    expect(isApplePlatform()).toBe(true);
    stubNavigator("", "Win32");
    expect(isApplePlatform()).toBe(false);
  });
});
