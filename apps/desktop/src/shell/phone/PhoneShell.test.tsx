// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../../settings/ThemeProvider";
import { useShellState, type ShellState } from "../useShellState";
import { PhoneShell } from "./PhoneShell";

// `useShellState` boots the workspace lifecycle and reaches for Tauri IPC when
// it believes it is running under Tauri. Mock both so the restore path is a
// no-op, matching `ShellRoot.test.tsx` and `useShellState.test.tsx`.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false)
}));

// The load path dereferences what the adapter returns, and the native-command
// mock resolves to null. Hand it a real document so opening a note works.
vi.mock("../../workspace/workspaceDocumentAdapter", () => ({
  workspaceDocumentApi: {
    readMarkdownDocument: vi.fn(() =>
      Promise.resolve({
        rootPath: "/vault",
        relativePath: "note.md",
        contents: "# Note\n\nSome text.",
        modifiedAtMs: 0
      })
    ),
    writeMarkdownDocument: vi.fn(),
    createMarkdownDocument: vi.fn()
  }
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

/**
 * Same mount, but hands the test the live shell so it can open and edit a note.
 * Reaching a dirty tab any other way would mean faking the reducer.
 */
const renderWithShell = async (): Promise<{
  host: HTMLDivElement;
  shell: () => ShellState;
}> => {
  const box: { current: ShellState | null } = { current: null };
  const Host = () => {
    const shell = useShellState();
    box.current = shell;
    return <PhoneShell shell={shell} />;
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
  return {
    host: container,
    shell: () => {
      if (!box.current) throw new Error("PhoneShell did not render");
      return box.current;
    }
  };
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

  // Both the header's `⋯` button and the sheet it opens are labelled
  // "Document tools", so every assertion here matches on the dialog role too —
  // an unscoped query would match the button, which is always present, and pass
  // whether or not the sheet ever opened.
  const inspector = (host: HTMLDivElement): Element | null =>
    host.querySelector('[role="dialog"][aria-label="Document tools"]');

  it("opens the inspector sheet from the header's document tools button", async () => {
    const host = await render();
    expect(inspector(host)).toBeNull();

    await click(host, "Document tools");

    expect(inspector(host)).not.toBeNull();
  });

  // `revealPanel` used to set `revealed` for any panel id while the content
  // branch only ever renders a *left* popout, so the default Assistant hub slot
  // full-screened the Files panel instead of opening an inspector.
  it("opens the inspector sheet from the assistant hub shortcut", async () => {
    const host = await render();

    const hub = host.querySelector('[aria-label="Primary navigation"]');
    await act(async () => {
      hub?.querySelector<HTMLButtonElement>('[aria-label="Assistant"]')?.click();
    });

    expect(inspector(host)).not.toBeNull();
    expect(inspector(host)?.querySelector('[aria-label="Assistant panel"]')).not.toBeNull();
    // The note stays on screen behind the sheet: no left panel takes over.
    expect(host.querySelector('[aria-label="Files panel"]')).toBeNull();
  });

  it("prompts before closing a tab that has unsaved work", async () => {
    // `requestClose` on a dirty tab does not close it — it parks a request and
    // waits. A shell with no prompt mounted swallows the close silently and
    // then no-ops every later attempt on that tab, which is what the phone did
    // until `TabCloseRequest` was rendered here too.
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    const tabId = shell().tabState.tabs[0]?.id;
    expect(tabId).toBeDefined();
    await act(async () => shell().updateDocument(tabId!, "edited text"));

    await click(host, "Open tabs (1)");
    const sheet = host.querySelector('[aria-label="Open tabs"]');
    await act(async () => {
      sheet?.querySelector<HTMLButtonElement>('[aria-label^="Close "]')?.click();
    });

    expect(document.querySelector('[role="dialog"][aria-label="Unsaved changes"]')).not.toBeNull();
    expect(shell().tabState.tabs).toHaveLength(1);
  });
});
