// @vitest-environment happy-dom
import { act } from "react";
import { afterAll, describe, expect, it, vi } from "vitest";

// The harness must be the first import: its `vi.mock("../../native/commands")`
// registers when the harness module evaluates, and `panelRegistryModel`
// transitively loads `workspaceAdapter` → `native/commands`. If the registry
// loaded first, the adapter would keep the real (non-Tauri) commands and the
// explorer's capability probe would silently fall back to desktop answers.
import {
  actionsMenu,
  bubbleBar,
  click,
  drawerOf,
  filesPanel,
  filesVisible,
  inspector,
  mockManagedWorkspaceAccess,
  mount,
  noteTitleVisible,
  openReadyNote,
  render,
  renderWithShell,
  storeBubbleLabels,
  tapBubble,
  visibleDialog
} from "./PhoneShell.testHarness";
import { useNotificationStore } from "../../notifications/notificationStore";
import { desktopPanelRegistry } from "../../panels/panelRegistryModel";
import { useShellState, type ShellState } from "../useShellState";
import { PhoneShell } from "./PhoneShell";

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

afterAll(() => {
  extensionPanel.dispose();
});

describe("PhoneShell", () => {
  it("renders no activity rail", async () => {
    const host = await render();

    expect(host.querySelector('[aria-label="Workspace sections"]')).toBeNull();
  });

  it("shows New note and Actions on Files, and no Home", async () => {
    const host = await render();

    const bar = bubbleBar(host);
    expect(bar).not.toBeNull();
    expect(bar?.querySelector('[aria-label="New note"]')).not.toBeNull();
    // Assistant is always available, so the ⋮ bubble is too.
    expect(bar?.querySelector('[aria-label="Actions"]')).not.toBeNull();
    expect(bar?.querySelector('[aria-label="Home"]')).toBeNull();
  });

  it("shows Home, New note and Actions on a note", async () => {
    const { host, shell } = await renderWithShell();
    await openReadyNote(shell);

    const bar = bubbleBar(host);
    for (const label of ["Home", "New note", "Actions"]) {
      expect(bar?.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    }
  });

  it("shows Home and Actions but no New note on a settings tab", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openSettingsTab());

    const bar = bubbleBar(host);
    expect(bar?.querySelector('[aria-label="Home"]')).not.toBeNull();
    expect(bar?.querySelector('[aria-label="Actions"]')).not.toBeNull();
    expect(bar?.querySelector('[aria-label="New note"]')).toBeNull();
  });

  it("navigates Home to Files, and Back returns to the note", async () => {
    const { host, shell } = await renderWithShell();
    await openReadyNote(shell);
    expect(noteTitleVisible(host)).toBe(true);

    await tapBubble(host, "home");
    expect(filesVisible(host)).toBe(true);
    expect(noteTitleVisible(host)).toBe(false);

    // Home pushed Files: Back revisits the note, not a toggle.
    await click(host, "Back");
    expect(noteTitleVisible(host)).toBe(true);
    expect(shell().tabState.tabs).toHaveLength(1);
  });

  it("opens the drawer from the header's main-menu button and closes it on its scrim", async () => {
    const host = await render();

    await click(host, "Main menu");
    expect(visibleDialog(host, "Navigation")).not.toBeNull();

    // The open drawer is full-height and covers ☰, so a real user cannot
    // tap the button again — the dismiss path is the scrim (or Back). Only
    // the drawer's own scrim is visible right now.
    await act(async () => {
      host.querySelector("[data-tn-scrim].visible")?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true })
      );
    });
    expect(visibleDialog(host, "Navigation")).toBeNull();

    // The button's handler is still a toggle — exercised here through a DOM
    // click, which unlike a real tap ignores that the drawer covers it.
    await click(host, "Main menu");
    expect(visibleDialog(host, "Navigation")).not.toBeNull();
    await click(host, "Main menu");
    expect(visibleDialog(host, "Navigation")).toBeNull();
  });

  it("places the real workspace selector below Menu and above drawer actions", async () => {
    const host = await render();

    await click(host, "Main menu");

    const drawer = visibleDialog(host, "Navigation");
    const title = [...(drawer?.querySelectorAll("h2") ?? [])].find((heading) => heading.textContent === "Menu");
    const selector = drawer?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
    const files = drawer?.querySelector<HTMLButtonElement>('button[aria-label="Files"]');
    if (!title || !selector || !files) throw new Error("Drawer workspace selector order was not rendered.");
    expect(title.compareDocumentPosition(selector) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(selector.compareDocumentPosition(files) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(filesPanel(host)?.querySelector('button[aria-haspopup="menu"]')).toBeNull();
  });

  // Both dialogs are owned and rendered by WorkspaceExplorer inside the Files
  // branch, which is `aria-hidden` while a note route is up. The drawer's
  // `onAction` hook must swap the drawer's entry for Files before the action
  // opens its dialog, or the dialog mounts under the hidden ancestor.
  it.each([
    { action: "Create vault…", dialogTitle: "Create managed vault" },
    { action: "Bring in from Git link…", dialogTitle: "Bring in workspace from Git link" }
  ])("reveals Files for the drawer's %s action before its dialog opens", async ({
    action,
    dialogTitle
  }) => {
    mockManagedWorkspaceAccess();
    const { host, shell } = await renderWithShell();
    await openReadyNote(shell);
    expect(noteTitleVisible(host)).toBe(true);

    await click(host, "Main menu");
    const drawer = visibleDialog(host, "Navigation");
    const trigger = drawer?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
    if (!trigger) throw new Error("Workspace selector trigger was not rendered.");
    await act(async () => trigger.click());

    const item = [...(drawer?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
      .find((button) => button.textContent?.includes(action));
    if (!item) throw new Error(`"${action}" was not rendered.`);
    await act(async () => item.click());

    expect(visibleDialog(host, "Navigation")).toBeNull();
    expect(filesVisible(host)).toBe(true);
    const heading = [...host.querySelectorAll("h2")].find((h) => h.textContent === dialogTitle);
    expect(heading).toBeTruthy();
    expect(heading?.closest('[aria-hidden="true"]')).toBeNull();
  });

  it("lists every registered left panel in the drawer with a visible label", async () => {
    const host = await render();

    await click(host, "Main menu");

    const drawer = visibleDialog(host, "Navigation");
    expect(drawer?.textContent).toContain("Files");
    expect(drawer?.textContent).toContain("Search");
    expect(drawer?.textContent).toContain("Settings");
  });

  it("closes the drawer after choosing a panel and reveals it full width", async () => {
    const host = await render();
    await click(host, "Main menu");
    const drawer = visibleDialog(host, "Navigation");
    expect(drawer).not.toBeNull();

    // Scoped to the drawer deliberately: nothing else on the phone chrome
    // carries a "Search" button, but scoping keeps the intent explicit.
    await act(async () => {
      drawer?.querySelector<HTMLButtonElement>('[aria-label="Search"]')?.click();
    });

    expect(visibleDialog(host, "Navigation")).toBeNull();
    expect(host.querySelector('[aria-label="Search panel"]')).not.toBeNull();
  });

  // The header's count button is labelled "Open tabs (n)" and the switcher's
  // dialog is labelled "Open tabs" — near-identical, so both are matched
  // exactly rather than by prefix, or the assertion would pass on the button.
  it("opens the tab switcher from the header count button", async () => {
    const host = await render();
    expect(visibleDialog(host, "Open tabs")).toBeNull();

    await click(host, "Open tabs (0)");

    const switcher = visibleDialog(host, "Open tabs");
    expect(switcher).not.toBeNull();
    expect(switcher?.getAttribute("role")).toBe("dialog");
  });

  it("keeps the bubbles visible while a panel is revealed", async () => {
    const host = await render();
    await click(host, "Main menu");
    await act(async () => {
      visibleDialog(host, "Navigation")
        ?.querySelector<HTMLButtonElement>('[aria-label="Search"]')
        ?.click();
    });

    expect(host.querySelector('[aria-label="Search panel"]')).not.toBeNull();
    expect(bubbleBar(host)?.querySelector('[aria-label="Home"]')).not.toBeNull();
  });

  it("toggles the action items menu from the ⋮ bubble", async () => {
    const host = await render();
    const trigger = () => bubbleBar(host)?.querySelector<HTMLButtonElement>('[aria-label="Actions"]');
    expect(inspector(host)).toBeNull();
    expect(trigger()?.getAttribute("aria-expanded")).toBe("false");

    await tapBubble(host, "actions");

    const menu = actionsMenu(host);
    expect(menu).not.toBeNull();
    expect(menu?.querySelector('[role="menuitem"][aria-label="Outline"]')).not.toBeNull();
    expect(trigger()?.getAttribute("aria-expanded")).toBe("true");
    // The menu alone does not open an inspector.
    expect(inspector(host)).toBeNull();

    await tapBubble(host, "actions");

    expect(actionsMenu(host)).toBeNull();
    expect(trigger()?.getAttribute("aria-expanded")).toBe("false");
  });

  it("drills actions → inspector, and the inspector's Back returns to the menu", async () => {
    const host = await render();
    await tapBubble(host, "actions");

    const menu = actionsMenu(host);
    await act(async () => {
      menu?.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Outline"]')?.click();
    });

    expect(inspector(host)).not.toBeNull();
    expect(inspector(host)?.querySelector('[aria-label="Outline panel"]')).not.toBeNull();

    // The inspector's header Back steps one level — back to the menu it came
    // from, not straight to content.
    await act(async () => {
      inspector(host)?.querySelector<HTMLButtonElement>('[aria-label="Back from Outline"]')?.click();
    });

    expect(inspector(host)).toBeNull();
    expect(actionsMenu(host)).not.toBeNull();
  });

  it("closes the whole actions → inspector flow on an outside tap", async () => {
    const host = await render();
    await tapBubble(host, "actions");
    const menu = actionsMenu(host);
    await act(async () => {
      menu?.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Outline"]')?.click();
    });
    expect(inspector(host)).not.toBeNull();

    // Every always-mounted overlay renders a scrim, so this must target the
    // inspector's own — the only one marked visible while it is open.
    await act(async () => {
      host.querySelector("[data-tn-scrim].visible")?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true })
      );
    });

    // Both entries close as one flow — no stranded actions menu underneath.
    expect(inspector(host)).toBeNull();
    expect(actionsMenu(host)).toBeNull();
  });

  it("dismisses the ⋮ menu on an outside tap that reaches its layer, not the bubble", async () => {
    const host = await render();
    await tapBubble(host, "actions");
    expect(actionsMenu(host)).not.toBeNull();

    // The menu's dismiss layer covers the whole shell above the bubbles:
    // the tap that would land on the trigger bubble hits the layer instead,
    // so the menu closes and does not immediately reopen.
    await act(async () => {
      actionsMenu(host)?.parentElement?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true })
      );
    });

    expect(actionsMenu(host)).toBeNull();
  });

  it("opens the inspector from the action-items menu, parented to it", async () => {
    const host = await render();
    await tapBubble(host, "actions");
    await act(async () => {
      actionsMenu(host)
        ?.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Assistant"]')
        ?.click();
    });

    expect(inspector(host)).not.toBeNull();
    expect(inspector(host)?.querySelector('[aria-label="Assistant panel"]')).not.toBeNull();
    // The menu was the inspector's parent, so it is gone while the inspector
    // is up — its Back restores it rather than leaving both.
    expect(actionsMenu(host)).toBeNull();
    expect(host.querySelector('[aria-label="Files panel"]')).not.toBeNull();
  });

  it("dismisses the tab switcher on Back before touching content history", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    expect(noteTitleVisible(host)).toBe(true);

    await click(host, "Open tabs (1)");
    expect(visibleDialog(host, "Open tabs")).not.toBeNull();

    // Topmost overlay goes first: Back closes the switcher but stays on the note.
    await click(host, "Back");
    expect(visibleDialog(host, "Open tabs")).toBeNull();
    expect(noteTitleVisible(host)).toBe(true);

    // And the next Back walks content history — back to Files.
    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);
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

  // The section inside the sheet carries the same accessible name, so this
  // matches the dialog explicitly — an unscoped query would pass on the
  // section alone and prove nothing about the sheet.
  it("renders the bottom panel as a sheet rather than a third bottom band", async () => {
    const { host, shell } = await renderWithShell();
    expect(visibleDialog(host, "Tools")).toBeNull();

    await act(async () => shell().updateBottomPanel("terminal"));

    const sheet = visibleDialog(host, "Tools");
    expect(sheet).not.toBeNull();
    expect(sheet?.querySelector('[aria-label="Bottom panel tabs"]')).not.toBeNull();
    // The sheet is aria-modal: bubbles mounted beneath it must leave the
    // screen entirely rather than stay focusable under the scrim.
    expect(bubbleBar(host)).toBeNull();

    // Dismissing the sheet must leave its content mounted so the slide-down
    // close animation has something to animate, matching InspectorSheet.
    // `role="dialog"` is omitted when closed (to avoid contradicting
    // `aria-hidden`), so query by `aria-label` alone.
    await act(async () => shell().updateBottomPanel(null));
    const closed = host.querySelector('[aria-label="Tools"][aria-hidden]');
    expect(closed?.getAttribute("aria-hidden")).toBe("true");
    expect(closed?.querySelector('[aria-label="Bottom panel tabs"]')).not.toBeNull();
    // And the bubbles come back once the modal surface is gone.
    expect(bubbleBar(host)).not.toBeNull();
  });

  it("hides the bubbles while the soft keyboard covers the bottom of the viewport", async () => {
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("visualViewport", {
      height: 500,
      offsetTop: 0,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    });

    const host = await render();

    expect(bubbleBar(host)).toBeNull();
  });

  it("carries conflict and notification counts in the bubbles' accessible names", async () => {
    // `conflictBadges` is derived inside `useShellState`, so the badge input
    // is overridden on the rendered shell — the same way the navigation
    // suite overrides `restoredWorkspacePath`.
    const box: { current: ShellState | null } = { current: null };
    const Host = () => {
      const state = useShellState();
      box.current = state;
      return <PhoneShell shell={{ ...state, conflictBadges: { conflicts: 3 } }} />;
    };
    const host = await mount(<Host />);
    const shell = (): ShellState => {
      if (!box.current) throw new Error("PhoneShell did not render");
      return box.current;
    };
    try {
      await openReadyNote(shell);
      // Two undismissed notifications aimed at a registered right panel —
      // "outline" is a real registry entry, so the store-to-bubble wiring is
      // what is under test, not the gating.
      await act(async () => {
        for (const title of ["one", "two"]) {
          useNotificationStore.getState().addNotification({
            source: "test",
            title,
            message: "m",
            severity: "silent",
            panel: "outline"
          });
        }
      });

      const bar = bubbleBar(host);
      expect(
        bar?.querySelector('[data-bubble="home"]')?.getAttribute("aria-label")
      ).toBe("Home, 3 conflicts");
      expect(
        bar?.querySelector('[data-bubble="actions"]')?.getAttribute("aria-label")
      ).toBe("Actions, 2 notifications");
      // The chips themselves render — the accessible name alone proves nothing
      // about the visible badge.
      expect(bar?.querySelector('[data-bubble="home"] .bg-danger')?.textContent).toBe("3");
      expect(bar?.querySelector('[data-bubble="actions"] .bg-danger')?.textContent).toBe("2");
    } finally {
      await act(async () => useNotificationStore.getState().clearAll());
    }
  });

  it("hides the bubbles under the drawer, the tab switcher and the inspector", async () => {
    const { host, shell } = await renderWithShell();
    await openReadyNote(shell);
    expect(bubbleBar(host)).not.toBeNull();

    await click(host, "Main menu");
    expect(bubbleBar(host)).toBeNull();
    await click(host, "Back");
    expect(bubbleBar(host)).not.toBeNull();

    await click(host, "Open tabs (1)");
    expect(bubbleBar(host)).toBeNull();
    await click(host, "Back");
    expect(bubbleBar(host)).not.toBeNull();

    await tapBubble(host, "actions");
    await act(async () => {
      actionsMenu(host)
        ?.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Outline"]')
        ?.click();
    });
    expect(inspector(host)).not.toBeNull();
    expect(bubbleBar(host)).toBeNull();
  });

  it("shows visible labels on the bubbles when the setting is on", async () => {
    storeBubbleLabels(true);
    const host = await render();

    const bar = bubbleBar(host);
    // The aria-label exists either way; the setting turns it into text.
    expect(bar?.textContent).toContain("New note");
    expect(bar?.textContent).toContain("Actions");
  });

  it("reveals an extension's left panel from the drawer", async () => {
    const host = await render();
    await click(host, "Main menu");

    const drawer = visibleDialog(host, "Navigation");
    expect(drawer).not.toBeNull();
    await act(async () => {
      drawer?.querySelector<HTMLButtonElement>('[aria-label="Hello notebook"]')?.click();
    });

    // The panel that was asked for, not whichever one the shell last selected.
    expect(host.querySelector('[aria-label="Hello notebook panel"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Files panel"]')).toBeNull();
  });

  it("slides a revealed panel in from the left", async () => {
    const host = await render();
    await click(host, "Main menu");
    await act(async () => {
      visibleDialog(host, "Navigation")
        ?.querySelector<HTMLButtonElement>('[aria-label="Search"]')
        ?.click();
    });

    const panel = host.querySelector('[aria-label="Search panel"]');
    expect(panel?.closest(".tn-slide-in-left")).not.toBeNull();
  });

  it("clears the drawer highlight after going back from a revealed panel", async () => {
    const { host, shell } = await renderWithShell();
    // The drawer *replaces* the current entry — under the note's entry here —
    // so Back still has a previous entry to land on.
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    await click(host, "Main menu");
    await act(async () => {
      visibleDialog(host, "Navigation")
        ?.querySelector<HTMLButtonElement>('[aria-label="Search"]')
        ?.click();
    });
    expect(host.querySelector('[aria-label="Search panel"]')).not.toBeNull();
    expect(shell().leftPanel).toBe("search");

    await click(host, "Back");

    // Back lands on the Files route, so the shell's left panel follows it to
    // explorer rather than being left lit on the panel that just closed.
    expect(host.querySelector('[aria-label="Search panel"]')).toBeNull();
    expect(shell().leftPanel).toBe("explorer");
    expect(drawerOf(host)?.querySelector('[aria-label="Search"]')?.getAttribute("aria-current")).toBeNull();
  });

  it("offers Version history inside the action-items menu, once, for the open file", async () => {
    const { host, shell } = await renderWithShell();
    await openReadyNote(shell);

    // The phone header carries no sync/version control at all, and no bespoke
    // Saved versions entry survives — the row is the registry's own.
    expect(host.querySelector('header [aria-label="Version history"]')).toBeNull();
    expect(host.querySelector('[aria-label="Saved versions"]')).toBeNull();

    await tapBubble(host, "actions");
    const menu = actionsMenu(host);
    expect(menu?.querySelectorAll('[aria-label="Version history"]')).toHaveLength(1);
    const row = menu?.querySelector<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Version history"]'
    );
    expect(row?.disabled).toBe(false);

    await act(async () => row?.click());

    // The same inspector the right dock renders on desktop — opened as the
    // actions menu's child, not a replaced content route.
    expect(inspector(host)).not.toBeNull();
    expect(inspector(host)?.querySelector('[aria-label="Version history panel"]')).not.toBeNull();
    expect(actionsMenu(host)).toBeNull();
  });

  it("the drawer and its scrim cover the whole shell, header included", async () => {
    const host = await render();
    await click(host, "Main menu");

    const drawer = visibleDialog(host, "Navigation");
    // Several scrims stay mounted (drawer, inspector, sheets) — the drawer's
    // own is the element immediately preceding its panel.
    const scrim = drawer?.previousElementSibling;
    expect(scrim?.getAttribute("data-tn-scrim")).not.toBeNull();

    // Full height: no bottom bound clearing the bubbles (they hide anyway),
    // and the panel spans the shell including the header.
    expect(drawer?.className).toContain("inset-y-0");
    expect(drawer?.className).not.toContain("bottom-[calc");
  });

  it("clipped, not scrollable: the shell root cannot be focus-scrolled", async () => {
    const host = await render();
    const main = host.querySelector('[aria-label="ThinkBrain mobile workspace"]');

    // Offscreen-translated sheets enlarge scrollable overflow; `clip` refuses
    // programmatic scroll where `hidden` would let WebView shift the shell.
    expect(main?.className).toContain("overflow-clip");
    expect(main?.className).not.toContain("overflow-hidden");
  });
});
