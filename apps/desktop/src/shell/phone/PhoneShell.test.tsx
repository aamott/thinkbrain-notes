// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../../settings/ThemeProvider";
import { useShellState } from "../useShellState";
import { PhoneShell } from "./PhoneShell";

// `useShellState` boots the workspace lifecycle and reaches for Tauri IPC when
// it believes it is running under Tauri. Mock both so the restore path is a
// no-op, matching `ShellRoot.test.tsx` and `useShellState.test.tsx`.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false)
}));

vi.mock("../../native/commands", () => ({
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
 * Mounts `PhoneShell` over real shell state, as `ShellRoot` does.
 *
 * `ThemeProvider` is not decoration: `useShellState` reads `useTheme()` for the
 * theme-toggle command and throws outside the provider.
 */
const render = async (): Promise<HTMLDivElement> => {
  const Host = () => <PhoneShell shell={useShellState()} />;
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

const click = async (host: HTMLDivElement, label: string): Promise<void> => {
  await act(async () => {
    host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
  });
};

describe("PhoneShell", () => {
  it("renders no activity rail", async () => {
    const host = await render();

    expect(host.querySelector('[aria-label="Workspace sections"]')).toBeNull();
  });

  it("shows the hub with visible labels rather than icon-only buttons", async () => {
    const host = await render();

    expect(host.querySelector('[aria-label="Primary navigation"]')?.textContent).toContain("Files");
  });

  // The command slot is the one hub target that can vanish silently:
  // `resolveHubItems` drops a command with no icon, so a default hub missing
  // "New note" would still render four plausible-looking slots.
  it("resolves every default hub slot, commands included", async () => {
    const host = await render();

    const hub = host.querySelector('[aria-label="Primary navigation"]');
    for (const label of ["Files", "Search", "New note", "Assistant", "Menu"]) {
      expect(hub?.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    }
  });

  it("opens the drawer from the header menu button", async () => {
    const host = await render();
    expect(host.querySelector('[aria-label="Navigation"]')).toBeNull();

    await click(host, "Open navigation");

    expect(host.querySelector('[aria-label="Navigation"]')).not.toBeNull();
  });

  it("opens the same drawer from the hub Menu slot", async () => {
    const host = await render();

    await click(host, "Menu");

    expect(host.querySelector('[aria-label="Navigation"]')).not.toBeNull();
  });

  it("lists every registered left panel in the drawer with a visible label", async () => {
    const host = await render();

    await click(host, "Open navigation");

    const drawer = host.querySelector('[aria-label="Navigation"]');
    expect(drawer?.textContent).toContain("Files");
    expect(drawer?.textContent).toContain("Search");
    expect(drawer?.textContent).toContain("Settings");
  });

  it("closes the drawer after choosing a panel and reveals it full width", async () => {
    const host = await render();
    await click(host, "Open navigation");
    const drawer = host.querySelector('[aria-label="Navigation"]');
    expect(drawer).not.toBeNull();

    // Scoped to the drawer deliberately: the hub carries a "Search" slot of its
    // own and comes first in the DOM, so an unscoped query would match that one
    // and prove nothing about the drawer row.
    await act(async () => {
      drawer?.querySelector<HTMLButtonElement>('[aria-label="Search"]')?.click();
    });

    expect(host.querySelector('[aria-label="Navigation"]')).toBeNull();
    expect(host.querySelector('[aria-label="Search panel"]')).not.toBeNull();
  });

  // The header's count button is labelled "Open tabs (n)" and the switcher's
  // dialog is labelled "Open tabs" — near-identical, so both are matched
  // exactly rather than by prefix, or the assertion would pass on the button.
  it("opens the tab switcher from the header count button", async () => {
    const host = await render();
    expect(host.querySelector('[aria-label="Open tabs"]')).toBeNull();

    await click(host, "Open tabs (0)");

    const switcher = host.querySelector('[aria-label="Open tabs"]');
    expect(switcher).not.toBeNull();
    expect(switcher?.getAttribute("role")).toBe("dialog");
  });

  it("keeps the hub visible while a panel is revealed", async () => {
    const host = await render();

    await click(host, "Search");

    expect(host.querySelector('[aria-label="Search panel"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Primary navigation"]')).not.toBeNull();
  });
});
