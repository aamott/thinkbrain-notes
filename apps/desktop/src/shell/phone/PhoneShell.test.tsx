// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { desktopPanelRegistry } from "../../panels/panelRegistryModel";
import { useSettingsStore } from "../../settings/settingsStore";
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

// The registry is a module singleton, so this extension panel is live for the
// whole file. It exists to prove the drawer's rows are actually reachable —
// `isBuiltInLeftPanel` is a literal list of first-party ids and rejected every
// one of these, so tapping an extension's panel used to do nothing.
const extensionPanel = desktopPanelRegistry.register({
  id: "hello-notes.notebook",
  label: "Hello notebook",
  icon: "notebook",
  side: "left",
  factory: () => <p>hello notebook</p>
});

afterAll(() => extensionPanel.dispose());

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  clearStoredHub();
  root = null;
  container = null;
});

/**
 * The settings store is a module singleton and the hub edits below really do
 * persist: `invokeNativeCommand` is mocked to resolve, so a save "succeeds" and
 * lands in `appValues`. Left there, one test's pin would be the next test's
 * starting hub. Only the hub key is cleared — blanking the store wholesale
 * would take the theme and desktop state with it.
 */
function clearStoredHub(): void {
  const appValues = { ...useSettingsStore.getState().appValues };
  delete appValues["ui.mobileHub"];
  useSettingsStore.setState({ appValues, stagedChanges: {}, isDirty: false, dirtyCount: 0 });
}

/** Seeds the persisted hub before a mount, the way a returning user would find it. */
function storeHub(items: readonly unknown[]): void {
  useSettingsStore.getState().stageChange("ui.mobileHub", JSON.stringify(items));
}

const hubOf = (host: HTMLDivElement): Element | null =>
  host.querySelector('[aria-label="Primary navigation"]');

const drawerOf = (host: HTMLDivElement): Element | null =>
  host.querySelector('[aria-label="Navigation"]');

/** Hub slot labels, in bar order — the assertion pin/remove actually needs. */
const hubLabels = (host: HTMLDivElement): readonly (string | null)[] =>
  [...(hubOf(host)?.querySelectorAll("button") ?? [])].map((button) =>
    button.getAttribute("aria-label")
  );

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

  // `StatusBar` does not render in phone chrome, so the header is the only
  // place sync trouble is visible at all. Scoped to the header's own button —
  // the pill is the one control there carrying a `title`.
  const pill = (host: HTMLDivElement): HTMLButtonElement | null =>
    host.querySelector<HTMLButtonElement>("header button[title]");

  it("reports sync state in the header", async () => {
    const host = await render();

    // The pill renders symbol-only in the phone header (compact mode); the
    // full sentence lives in the tooltip / accessible name, not the text.
    const syncButton = pill(host);
    expect(syncButton).not.toBeNull();
    expect(syncButton?.getAttribute("title")).toContain("not being saved");
    expect(syncButton?.textContent).toContain("—");
  });

  it("reveals the panel behind the sync pill instead of opening a desktop dock", async () => {
    const host = await render();

    await act(async () => pill(host)?.click());

    // "off" sends you to the history, which on a phone is a revealed panel.
    expect(host.querySelector('[aria-label="Saved versions panel"]')).not.toBeNull();
  });

  // The section inside the sheet carries the same accessible name, so this
  // matches the dialog explicitly — an unscoped query would pass on the
  // section alone and prove nothing about the sheet.
  it("renders the bottom panel as a sheet rather than a third bottom band", async () => {
    const { host, shell } = await renderWithShell();
    expect(host.querySelector('[role="dialog"][aria-label="Tools"]')).toBeNull();

    await act(async () => shell().updateBottomPanel("terminal"));

    const sheet = host.querySelector('[role="dialog"][aria-label="Tools"]');
    expect(sheet).not.toBeNull();
    expect(sheet?.querySelector('[aria-label="Bottom panel tabs"]')).not.toBeNull();
  });

  it("hides the hub while the soft keyboard covers the bottom of the viewport", async () => {
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("visualViewport", {
      height: 500,
      offsetTop: 0,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    });

    const host = await render();

    expect(host.querySelector('[aria-label="Primary navigation"]')).toBeNull();
  });

  // The default hub already holds MAX_HUB_ITEMS slots, so a pin from a fresh
  // install is refused. Start from a two-slot hub, which is what a user who had
  // pruned the bar would come back to.
  it("pins a panel to the hub from a drawer long press", async () => {
    storeHub([{ kind: "panel", id: "explorer" }, { kind: "menu" }]);
    const host = await render();
    expect(hubOf(host)?.textContent).not.toContain("Saved versions");
    await click(host, "Open navigation");

    // On touch, press-and-hold fires `contextmenu`, which is what the drawer
    // rows listen for — no second long-press timer of their own.
    await act(async () => {
      drawerOf(host)
        ?.querySelector('[aria-label="Saved versions"]')
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });

    // Pinned before the menu, which stays the last slot.
    expect(hubLabels(host)).toEqual(["Files", "Saved versions", "Menu"]);
    // And the row now says so, so a second hold that changes nothing reads as
    // "already done" rather than as a broken gesture.
    expect(drawerOf(host)?.querySelector('[aria-label="Saved versions"]')?.textContent).toContain(
      "Pinned"
    );
  });

  // Silently dropping the pin is the failure this guards: the hub is full out
  // of the box, so the first hold a new user tries is a refused one.
  it("refuses a sixth shortcut and says why in the drawer", async () => {
    const host = await render();
    await click(host, "Open navigation");
    expect(drawerOf(host)?.textContent).toContain("The bottom bar is full");

    await act(async () => {
      drawerOf(host)
        ?.querySelector('[aria-label="Saved versions"]')
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });

    expect(hubLabels(host)).toEqual(["Files", "Search", "New note", "Assistant", "Menu"]);
  });

  it("removes a hub shortcut on a long press and leaves the menu alone", async () => {
    const host = await render();
    vi.useFakeTimers();

    // `BottomNav` is what turns a 500ms hold into the callback, so the hold is
    // exercised through it rather than reimplemented here.
    const hold = async (label: string): Promise<void> => {
      const slot = hubOf(host)?.querySelector(`[aria-label="${label}"]`);
      await act(async () => {
        slot?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        vi.advanceTimersByTime(600);
      });
    };

    await hold("Files");
    await hold("Menu");

    vi.useRealTimers();
    expect(hubLabels(host)).toEqual(["Search", "New note", "Assistant", "Menu"]);
  });

  it("reveals an extension's left panel from the drawer", async () => {
    const host = await render();
    await click(host, "Open navigation");

    // Scoped to the drawer: the hub renders its own slots with the same labels.
    const drawer = host.querySelector('[aria-label="Navigation"]');
    expect(drawer).not.toBeNull();
    await act(async () => {
      drawer?.querySelector<HTMLButtonElement>('[aria-label="Hello notebook"]')?.click();
    });

    // The panel that was asked for, not whichever one the shell last selected.
    expect(host.querySelector('[aria-label="Hello notebook panel"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Files panel"]')).toBeNull();
  });
});
