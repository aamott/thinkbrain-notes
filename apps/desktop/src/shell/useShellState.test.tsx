// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../settings/ThemeProvider";
import { useShellState, type ShellState } from "./useShellState";

// The shell state boots the workspace lifecycle, which reaches for Tauri IPC
// when it believes it is running under Tauri. Under happy-dom it is not, but
// mock it explicitly so the restore path is a no-op regardless of environment.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false)
}));

vi.mock("../native/commands", () => ({
  invokeNativeCommand: vi.fn(() => Promise.resolve(null))
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/**
 * Renders the hook with no chrome and hands back its latest value.
 *
 * The point of the extraction is that shell state runs without `DesktopShell`,
 * so the probe renders nothing at all. `ThemeProvider` is still required —
 * `useShellState` consumes `useTheme()` for the theme-toggle command.
 */
async function renderShellState(): Promise<() => ShellState> {
  // A box rather than a bare `let`: assigning inside the render callback does
  // not narrow, and TypeScript would otherwise read the variable as `null`.
  const box: { current: ShellState | null } = { current: null };
  function Probe(): null {
    box.current = useShellState();
    return null;
  }
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
  });
  return () => {
    if (!box.current) throw new Error("useShellState did not render");
    return box.current;
  };
}

describe("useShellState", () => {
  it("provides shell state without any chrome mounted", async () => {
    const state = await renderShellState();

    expect(state().tabState.tabs).toEqual([]);
    expect(state().leftPanel).toBe("explorer");
    expect(state().rightPanel).toBeNull();
    expect(state().paletteOpen).toBe(false);
  });

  it("opens and closes the command palette", async () => {
    const state = await renderShellState();

    await act(async () => state().openPalette());
    expect(state().paletteOpen).toBe(true);

    await act(async () => state().closePalette(false));
    expect(state().paletteOpen).toBe(false);
  });

  it("opens a settings tab through the shared action", async () => {
    const state = await renderShellState();

    await act(async () => state().openSettingsTab());

    expect(state().tabState.tabs.map((tab) => tab.id)).toContain("settings");
  });

  it("toggles a right panel on and off", async () => {
    const state = await renderShellState();

    await act(async () => state().toggleRightPanel("outline"));
    expect(state().rightPanel).toBe("outline");

    await act(async () => state().toggleRightPanel("outline"));
    expect(state().rightPanel).toBeNull();
  });

  it("clears the history panel's note filter", async () => {
    const state = await renderShellState();

    await act(async () => state().showVersionsOf("/vault", "note.md"));
    expect(state().versionsOf).toBe("note.md");
    expect(state().leftPanel).toBe("history");

    await act(async () => state().clearVersions());
    expect(state().versionsOf).toBeNull();
  });
});
