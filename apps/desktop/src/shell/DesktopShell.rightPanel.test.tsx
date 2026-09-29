// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../settings/ThemeProvider";
import { createVersionDiffTab } from "../tabs/tabModel";
import { DesktopShell } from "./DesktopShell";
import { useShellState, type ShellState } from "./useShellState";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => false) }));
vi.mock("../native/commands", () => ({
  // Commands a mounted tab actually issues need real-shaped answers: a null
  // document crashes the view-state reader, and a null version diff crashes
  // the comparison surface.
  invokeNativeCommand: vi.fn(async (command: string) => {
    if (command === "read_markdown_file") {
      return { relative_path: "note.md", contents: "# Note\n" };
    }
    if (command === "read_version_diff") {
      return {
        kind: "text",
        change: "chg-1",
        notePath: "note.md",
        chunks: [{ kind: "common", text: "# Note\n" }]
      };
    }
    return null;
  })
}));

/**
 * A selected-but-unavailable right panel must not claim chrome: no popout, no
 * resize handle, no reserved width, no active title-bar action. The gate is
 * `desktopPanelRegistry.isAvailable` against the same context the popout
 * renders with, so the two can never disagree about "the active document".
 */

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let live: ShellState | null = null;

const mount = async (): Promise<HTMLDivElement> => {
  const Host = () => {
    live = useShellState();
    return <DesktopShell shell={live} />;
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <ThemeProvider>
        <Host />
      </ThemeProvider>
    );
  });
  return container;
};

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  live = null;
});

const shell = (): ShellState => {
  if (!live) throw new Error("shell did not render");
  return live;
};

/** Everything the right dock would draw when it is allowed to exist. */
const rightChrome = (host: HTMLElement) => ({
  popout: host.querySelector('[aria-label="Version history panel"]'),
  handle: host.querySelector('[aria-label="Resize right panel. Use arrow keys to resize."]'),
  width: host.querySelector("main")?.style.getPropertyValue("--tn-shell-right-width")
});

describe("DesktopShell right-panel availability gate", () => {
  it("hides a selected Version history while no file is active", async () => {
    const host = await mount();
    await act(async () => shell().setRightPanel("history"));

    expect(shell().rightPanel).toBe("history");
    const { popout, handle, width } = rightChrome(host);
    expect(popout).toBeNull();
    expect(handle).toBeNull();
    expect(width).toBe("0px");
  });

  it("hides a selected Version history while a comparison tab is active", async () => {
    const host = await mount();
    await act(async () =>
      shell().dispatchTabs({
        type: "open",
        tab: createVersionDiffTab({ rootPath: "/notes", relativePath: "note.md" }, "chg-1")
      })
    );
    await act(async () => shell().setRightPanel("history"));

    const { popout, handle, width } = rightChrome(host);
    expect(popout).toBeNull();
    expect(handle).toBeNull();
    expect(width).toBe("0px");
  });

  it("hides a selected Version history while a settings tab is active", async () => {
    const host = await mount();
    await act(async () => shell().openSettingsTab());
    await act(async () => shell().setRightPanel("history"));

    const { popout, handle } = rightChrome(host);
    expect(popout).toBeNull();
    expect(handle).toBeNull();
  });

  it("shows Version history again once a file tab is active", async () => {
    const host = await mount();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    await act(async () => shell().setRightPanel("history"));

    const { popout, handle, width } = rightChrome(host);
    expect(popout).not.toBeNull();
    expect(handle).not.toBeNull();
    expect(width).not.toBe("0px");
  });
});
