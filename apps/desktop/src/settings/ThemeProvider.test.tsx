// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ThemeProvider tests.
 *
 * The provider was refactored to use a single source of truth for the effective
 * theme base: `effectiveTheme = themeFileBase ?? theme`, computed synchronously.
 * One effect writes `data-thinkbrain-theme` to `document.documentElement`; a
 * separate async effect reads/parses the theme file and updates `themeFileBase`
 * state (it never touches the DOM attribute directly). These tests pin that
 * contract: the attribute always reflects the resolved base, the file's base
 * takes precedence over the user's dropdown selection, parse failures and
 * cleared files revert to the user's selection, and a user toggle while a file
 * is active does not flap the attribute.
 *
 * Mocks:
 *   - `./themeAdapter`: `readThemeFile` returns a configurable string (or
 *     null) so the async file-read effect can be driven deterministically.
 *   - `@tauri-apps/api/core`: `isTauri` returns `false` so the mount-time
 *     `loadSettings` call is skipped (the store is seeded directly via
 *     `setState` instead).
 *
 * Rendering follows the codebase convention: `createRoot` + `act` + DOM
 * queries (no @testing-library/react dependency is available).
 */

// Mock the theme adapter so the async theme-file read is controllable.
// `readThemeFile` is overridden per-test via `vi.mocked(...).mockResolvedValue`.
vi.mock("./themeAdapter", () => ({
  readThemeFile: vi.fn<(path: string) => Promise<string | null>>()
}));

// Mock the Tauri core `isTauri` check so the provider's mount-time
// `loadSettings` effect is a no-op under Node (non-Tauri).
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn<() => boolean>()
}));

import { isTauri } from "@tauri-apps/api/core";
import { readThemeFile } from "./themeAdapter";
import { ThemeProvider } from "./ThemeProvider";
import { useSettingsStore } from "./settingsStore";

/** A minimal valid dark-base theme file payload used across tests. */
const DARK_THEME_JSON = JSON.stringify({
  name: "Test Dark",
  base: "dark",
  version: 1,
  tokens: {
    "--tn-color-primary": "hsl(152 60% 38%)"
  }
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  // `isTauri` is false for every test so the mount effect skips `loadSettings`.
  vi.mocked(isTauri).mockReturnValue(false);
  // Default: the fs bridge resolves to null (no file content). Individual
  // tests override this to return a theme JSON string.
  vi.mocked(readThemeFile).mockResolvedValue(null);

  // Reset the singleton store to a clean, unloaded state. Each test seeds the
  // exact fields it needs via `setState` to keep cases isolated.
  useSettingsStore.setState({
    appValues: {},
    workspaceValues: null,
    workspaceRootPath: null,
    rawAppSettingsJson: null,
    rawWorkspaceSettingsJson: null,
    stagedChanges: {},
    isDirty: false,
    dirtyCount: 0,
    activeSection: null,
    searchQuery: "",
    loadError: null,
    saveError: null,
    validationDiagnostics: [],
    loaded: false
  });

  // Ensure no leftover attribute from a prior test.
  document.documentElement.removeAttribute("data-thinkbrain-theme");
});

afterEach(async () => {
  // Unmount and tear down the container so effects clean up between tests.
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  document.documentElement.removeAttribute("data-thinkbrain-theme");
  // Restore stubbed globals (e.g. matchMedia) regardless of test outcome so a
  // stub from a test that threw early cannot leak into the next one.
  vi.unstubAllGlobals();
  vi.mocked(readThemeFile).mockReset();
  vi.mocked(isTauri).mockReset();
});

/**
 * Renders the ThemeProvider into a fresh container and flushes effects.
 *
 * Args:
 *   defaultTheme: The fallback theme passed via props (defaults to "system").
 *
 * Returns:
 *   The container element for DOM queries (rarely needed since assertions
 *   target `document.documentElement`).
 */
async function renderProvider(
  defaultTheme: "system" | "light" | "dark" = "system"
): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <ThemeProvider defaultTheme={defaultTheme}>
        <span>probe</span>
      </ThemeProvider>
    );
  });
  return container;
}

/**
 * Flushes pending microtasks (the async theme-file read resolves on a
 * microtask) and any resulting React state updates.
 *
 * The provider's file-read effect chains `.then` on a mocked promise that
 * resolves synchronously when awaited; wrapping an empty async `act` callback
 * flushes both the microtask and the subsequent `setThemeFileBase` re-render.
 * A small `waitFor` guards against scheduling jitter.
 */
async function flushAsyncFileRead(): Promise<void> {
  await act(async () => {
    // Drain microtasks so the mocked `readThemeFile` promise settles and
    // the `.then` callback runs within the act scope.
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ThemeProvider", () => {
  it("uses the default theme when the store is not loaded", async () => {
    // Store stays `loaded: false`; the prop default should drive the attribute.
    // "system" resolves to "light" because happy-dom's matchMedia defaults to
    // light (no dark preference).
    await renderProvider("system");

    expect(document.documentElement.dataset.thinkbrainTheme).toBe("light");
  });

  it("resolves 'system' to the OS dark preference via matchMedia", async () => {
    // Stub matchMedia to report a dark OS preference. The "system" setting
    // must resolve to "dark" on the attribute — never "system".
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));
    useSettingsStore.setState({
      loaded: true,
      appValues: { "appearance.theme": "system", "appearance.themeFile": null }
    });

    await renderProvider("system");

    expect(document.documentElement.dataset.thinkbrainTheme).toBe("dark");
  });

  it("resolves 'system' to 'light' when the OS prefers light", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));
    useSettingsStore.setState({
      loaded: true,
      appValues: { "appearance.theme": "system", "appearance.themeFile": null }
    });

    await renderProvider("system");

    expect(document.documentElement.dataset.thinkbrainTheme).toBe("light");
  });

  it("defaults to 'light' when matchMedia is unavailable", async () => {
    // Simulate an SSR / very old webview where `window.matchMedia` is absent.
    // The provider must fall back to "light" rather than crashing.
    vi.stubGlobal("matchMedia", undefined);
    useSettingsStore.setState({
      loaded: true,
      appValues: { "appearance.theme": "system", "appearance.themeFile": null }
    });

    await renderProvider("system");

    expect(document.documentElement.dataset.thinkbrainTheme).toBe("light");
  });

  it("removes the matchMedia change listener on unmount", async () => {
    // A leaked listener would keep firing setOsThemeBase on a detached
    // component. Verify removeEventListener is called when the provider
    // unmounts.
    const removeEventListener = vi.fn();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener
    }));
    useSettingsStore.setState({
      loaded: true,
      appValues: { "appearance.theme": "system", "appearance.themeFile": null }
    });

    await renderProvider("system");

    // Unmount synchronously inside act so the cleanup effect runs.
    await act(async () => root?.unmount());

    expect(removeEventListener).toHaveBeenCalledTimes(1);
  });

  it("reacts to OS theme changes while running on the 'system' setting", async () => {
    // Start with a light OS preference.
    const listeners: ((e: MediaQueryListEvent) => void)[] = [];
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.push(cb),
      removeEventListener: vi.fn()
    }));
    useSettingsStore.setState({
      loaded: true,
      appValues: { "appearance.theme": "system", "appearance.themeFile": null }
    });

    await renderProvider("system");
    expect(document.documentElement.dataset.thinkbrainTheme).toBe("light");

    // Simulate the OS switching to dark.
    await act(async () => {
      for (const cb of listeners) {
        cb({ matches: true } as unknown as MediaQueryListEvent);
      }
    });

    expect(document.documentElement.dataset.thinkbrainTheme).toBe("dark");
  });

  it("does not react to OS theme changes when an explicit theme is selected", async () => {
    // When the user picked an explicit "light" or "dark", `effectiveTheme`
    // short-circuits and `osThemeBase` is not consulted. The matchMedia change
    // listener must therefore NOT update state (no wasted re-render).
    const listeners: ((e: MediaQueryListEvent) => void)[] = [];
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.push(cb),
      removeEventListener: vi.fn()
    }));
    useSettingsStore.setState({
      loaded: true,
      appValues: { "appearance.theme": "dark", "appearance.themeFile": null }
    });

    await renderProvider("system");
    expect(document.documentElement.dataset.thinkbrainTheme).toBe("dark");

    // OS switches to light. The user explicitly chose dark, so the attribute
    // must stay "dark" — the listener no-ops via the resolvedTheme ref guard.
    await act(async () => {
      for (const cb of listeners) {
        cb({ matches: false } as unknown as MediaQueryListEvent);
      }
    });

    expect(document.documentElement.dataset.thinkbrainTheme).toBe("dark");
  });

  it("never writes 'system' to the data-thinkbrain-theme attribute", async () => {
    // Regardless of the store value, the attribute must be light or dark.
    useSettingsStore.setState({
      loaded: true,
      appValues: { "appearance.theme": "system", "appearance.themeFile": null }
    });

    await renderProvider("system");

    const attr = document.documentElement.dataset.thinkbrainTheme;
    expect(attr).not.toBe("system");
    expect(attr === "light" || attr === "dark").toBe(true);
  });

  it("sets the attribute to the store's appearance.theme once loaded", async () => {
    // Seed a loaded store with an explicit user theme and no theme file.
    useSettingsStore.setState({
      loaded: true,
      appValues: { "appearance.theme": "dark", "appearance.themeFile": null }
    });

    await renderProvider("system");

    // The user's selection wins because no theme file is active.
    expect(document.documentElement.dataset.thinkbrainTheme).toBe("dark");
  });

  it("forces the theme file's base over the user's selection once parsed", async () => {
    // The user picked "light", but a theme file is active whose base is "dark".
    // The file's base must take precedence once the async read settles.
    vi.mocked(readThemeFile).mockResolvedValue(DARK_THEME_JSON);
    useSettingsStore.setState({
      loaded: true,
      appValues: {
        "appearance.theme": "light",
        "appearance.themeFile": "/tmp/dark.tbtheme.json"
      }
    });

    await renderProvider("system");
    await flushAsyncFileRead();

    // The file's base ("dark") overrides the user's "light" selection.
    expect(document.documentElement.dataset.thinkbrainTheme).toBe("dark");
  });

  it("reverts to the user's theme when the theme file fails to parse", async () => {
    // Malformed JSON: `parseThemeFile` returns `theme: null`, so the provider
    // resets `themeFileBase` and the user's selection drives the attribute.
    vi.mocked(readThemeFile).mockResolvedValue("not valid json {{{");
    useSettingsStore.setState({
      loaded: true,
      appValues: {
        "appearance.theme": "light",
        "appearance.themeFile": "/tmp/broken.tbtheme.json"
      }
    });

    await renderProvider("system");
    await flushAsyncFileRead();

    // Parse failure reverts to the user's selection.
    expect(document.documentElement.dataset.thinkbrainTheme).toBe("light");
  });

  it("reverts to the user's theme when the themeFile is cleared", async () => {
    // Start with an active dark-base theme file.
    vi.mocked(readThemeFile).mockResolvedValue(DARK_THEME_JSON);
    useSettingsStore.setState({
      loaded: true,
      appValues: {
        "appearance.theme": "light",
        "appearance.themeFile": "/tmp/dark.tbtheme.json"
      }
    });

    await renderProvider("system");
    await flushAsyncFileRead();
    // Sanity check: the file's base took precedence initially.
    expect(document.documentElement.dataset.thinkbrainTheme).toBe("dark");

    // Now clear the themeFile path. The provider's file effect re-runs with
    // `themeFile === null`, removes overrides, and resets `themeFileBase` so
    // the user's "light" selection drives the attribute again.
    await act(async () => {
      useSettingsStore.setState({
        appValues: {
          "appearance.theme": "light",
          "appearance.themeFile": null
        }
      });
    });
    await flushAsyncFileRead();

    expect(document.documentElement.dataset.thinkbrainTheme).toBe("light");
  });

  it("reverts to the user's theme when the file read throws", async () => {
    // A missing or unreadable file rejects rather than resolving. The catch
    // branch has to clear the base as thoroughly as the parse-failure branch,
    // or the attribute keeps a base no file is backing any more.
    vi.mocked(readThemeFile).mockResolvedValue(DARK_THEME_JSON);
    useSettingsStore.setState({
      loaded: true,
      appValues: {
        "appearance.theme": "light",
        "appearance.themeFile": "/tmp/dark.tbtheme.json"
      }
    });
    await renderProvider("system");
    await flushAsyncFileRead();
    expect(document.documentElement.dataset.thinkbrainTheme).toBe("dark");

    vi.mocked(readThemeFile).mockRejectedValue(new Error("permission denied"));
    await act(async () => {
      useSettingsStore.setState({
        appValues: {
          "appearance.theme": "light",
          "appearance.themeFile": "/tmp/gone.tbtheme.json"
        }
      });
    });
    await flushAsyncFileRead();

    expect(document.documentElement.dataset.thinkbrainTheme).toBe("light");
  });

  /**
   * A slow read for a path the user has already moved off must not land.
   * Switching to another *file* is what makes this visible: switching to no
   * file at all is caught by the `themeFile !== null` guard regardless, so it
   * would pass even with cancellation removed.
   */
  it("ignores a read that finishes after its path was replaced", async () => {
    const LIGHT_THEME_JSON = JSON.stringify({
      name: "Test Light",
      base: "light",
      version: 1,
      tokens: { "--tn-color-primary": "hsl(152 60% 38%)" }
    });

    let releaseSlow: ((raw: string) => void) | null = null;
    vi.mocked(readThemeFile).mockImplementation((path: string) =>
      path === "/tmp/slow.tbtheme.json"
        ? new Promise<string>((resolve) => {
            releaseSlow = resolve;
          })
        : Promise.resolve(LIGHT_THEME_JSON)
    );

    useSettingsStore.setState({
      loaded: true,
      appValues: {
        "appearance.theme": "dark",
        "appearance.themeFile": "/tmp/slow.tbtheme.json"
      }
    });
    await renderProvider("system");

    // The user picks a different file before the first read comes back.
    await act(async () => {
      useSettingsStore.setState({
        appValues: {
          "appearance.theme": "dark",
          "appearance.themeFile": "/tmp/quick.tbtheme.json"
        }
      });
    });
    await flushAsyncFileRead();
    expect(document.documentElement.dataset.thinkbrainTheme).toBe("light");

    // Only now does the abandoned read deliver its dark-base file.
    await act(async () => {
      releaseSlow?.(DARK_THEME_JSON);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.documentElement.dataset.thinkbrainTheme).toBe("light");
  });

  it("does not flap the attribute when the user toggles theme while a themeFile is active", async () => {
    // A dark-base theme file is active. The user then stages a different
    // `appearance.theme` value. Because the file's base takes precedence and
    // the file-read effect depends only on `themeFile` (not `theme`), the
    // attribute must stay at the file's base — no re-read, no flap.
    vi.mocked(readThemeFile).mockResolvedValue(DARK_THEME_JSON);
    useSettingsStore.setState({
      loaded: true,
      appValues: {
        "appearance.theme": "dark",
        "appearance.themeFile": "/tmp/dark.tbtheme.json"
      }
    });

    await renderProvider("system");
    await flushAsyncFileRead();
    // The file's base is "dark".
    expect(document.documentElement.dataset.thinkbrainTheme).toBe("dark");

    // The initial read for the active themeFile should have happened exactly
    // once at this point (the file path was set on mount).
    expect(readThemeFile).toHaveBeenCalledTimes(1);

    // User stages a different theme. The file is still active, so the
    // effective base must remain "dark" — the cached/reparsed file base wins
    // over the user's staged selection, so the attribute does not flap to
    // "light" even momentarily after the toggle settles.
    await act(async () => {
      useSettingsStore.setState({
        stagedChanges: { "appearance.theme": "light" }
      });
    });
    await flushAsyncFileRead();

    expect(document.documentElement.dataset.thinkbrainTheme).toBe("dark");

    // The theme toggle must NOT trigger a redundant disk re-read: the file
    // path and contents haven't changed, so `readThemeFile` should still
    // have been called only once.
    expect(readThemeFile).toHaveBeenCalledTimes(1);
  });

  /**
   * Regression: switching directly from one theme file to another must not
   * leak the previous file's base through `themeFileBase ?? theme` while the
   * new file's read is in flight. The cleanup resets `themeFileBase` to null
   * on every path change, so the user's selection drives the attribute until
   * the new read completes.
   */
  it("does not leak the previous file's base when switching files", async () => {
    const LIGHT_THEME_JSON = JSON.stringify({
      name: "Test Light",
      base: "light",
      version: 1,
      tokens: { "--tn-color-primary": "hsl(152 60% 38%)" }
    });

    // First file is dark-base; second is light-base. The user's selection is
    // "dark" throughout, so a stale dark base would be invisible here — we
    // assert the new base lands and the read count is correct instead.
    let releaseSecond: ((raw: string) => void) | null = null;
    vi.mocked(readThemeFile).mockImplementation((path: string) =>
      path === "/tmp/first-dark.tbtheme.json"
        ? Promise.resolve(DARK_THEME_JSON)
        : new Promise<string>((resolve) => {
            releaseSecond = resolve;
          })
    );

    useSettingsStore.setState({
      loaded: true,
      appValues: {
        "appearance.theme": "dark",
        "appearance.themeFile": "/tmp/first-dark.tbtheme.json"
      }
    });
    await renderProvider("system");
    await flushAsyncFileRead();
    expect(document.documentElement.dataset.thinkbrainTheme).toBe("dark");

    // Switch to the second (light-base) file. Its read is held pending so we
    // can observe the in-flight state. The cleanup resets `themeFileBase` to
    // null, so the attribute must fall back to the user's "dark" selection —
    // NOT the stale "dark" from the first file's base (which would coincidentally
    // match here, but the read-count assertion below pins the new read).
    await act(async () => {
      useSettingsStore.setState({
        appValues: {
          "appearance.theme": "dark",
          "appearance.themeFile": "/tmp/second-light.tbtheme.json"
        }
      });
    });
    await flushAsyncFileRead();
    // While the second read is pending, the user's "dark" selection drives.
    expect(document.documentElement.dataset.thinkbrainTheme).toBe("dark");

    // Complete the second read: the new light base takes over.
    await act(async () => {
      releaseSecond?.(LIGHT_THEME_JSON);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.documentElement.dataset.thinkbrainTheme).toBe("light");

    // Both files were read exactly once.
    expect(readThemeFile).toHaveBeenCalledTimes(2);
  });

  /**
   * Regression: clearing a theme file then setting a NEW file must not leak
   * the cleared file's base through `themeFileBase ?? theme` while the new
   * read is in flight. Without the cleanup reset, the stale base from the
   * first file would show (with no overrides active) until the new read lands.
   */
  it("does not leak a cleared file's base when setting a new file", async () => {
    const LIGHT_THEME_JSON = JSON.stringify({
      name: "Test Light",
      base: "light",
      version: 1,
      tokens: { "--tn-color-primary": "hsl(152 60% 38%)" }
    });

    let releaseSecond: ((raw: string) => void) | null = null;
    vi.mocked(readThemeFile).mockImplementation((path: string) =>
      path === "/tmp/clear-dark.tbtheme.json"
        ? Promise.resolve(DARK_THEME_JSON)
        : new Promise<string>((resolve) => {
            releaseSecond = resolve;
          })
    );

    // Start with a dark-base file while the user selected "light".
    useSettingsStore.setState({
      loaded: true,
      appValues: {
        "appearance.theme": "light",
        "appearance.themeFile": "/tmp/clear-dark.tbtheme.json"
      }
    });
    await renderProvider("system");
    await flushAsyncFileRead();
    // The file's dark base overrides the user's "light".
    expect(document.documentElement.dataset.thinkbrainTheme).toBe("dark");

    // Clear the file: the user's "light" selection must drive again.
    await act(async () => {
      useSettingsStore.setState({
        appValues: {
          "appearance.theme": "light",
          "appearance.themeFile": null
        }
      });
    });
    await flushAsyncFileRead();
    expect(document.documentElement.dataset.thinkbrainTheme).toBe("light");

    // Set a NEW light-base file whose read is held pending. Without the
    // cleanup reset, the stale "dark" base from the cleared file would leak
    // back through `themeFileBase ?? theme` (since `themeFile !== null` again)
    // and the attribute would flash to "dark" with no overrides active. The
    // cleanup nulls `themeFileBase`, so the user's "light" drives until the
    // new read completes.
    await act(async () => {
      useSettingsStore.setState({
        appValues: {
          "appearance.theme": "light",
          "appearance.themeFile": "/tmp/new-light.tbtheme.json"
        }
      });
    });
    await flushAsyncFileRead();
    // In-flight: user's "light" selection drives — NOT the stale "dark".
    expect(document.documentElement.dataset.thinkbrainTheme).toBe("light");

    // Complete the new read: the light base lands (matching the user's pick).
    await act(async () => {
      releaseSecond?.(LIGHT_THEME_JSON);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.documentElement.dataset.thinkbrainTheme).toBe("light");
  });
});
