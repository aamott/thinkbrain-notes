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
  click,
  drawerOf,
  filesPanel,
  filesVisible,
  hubLabels,
  hubOf,
  inspector,
  mockManagedWorkspaceAccess,
  noteTitleVisible,
  openReadyNote,
  render,
  renderWithShell,
  storeHub,
  visibleDialog
} from "./PhoneShell.testHarness";
import { desktopPanelRegistry } from "../../panels/panelRegistryModel";

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

  it("opens the drawer from the hub Menu slot", async () => {
    const host = await render();

    await click(host, "Menu");

    expect(visibleDialog(host, "Navigation")).not.toBeNull();
  });

  it("places the real workspace selector below Menu and above drawer actions", async () => {
    const host = await render();

    await click(host, "Menu");

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

    await click(host, "Menu");
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

    await click(host, "Menu");

    const drawer = visibleDialog(host, "Navigation");
    expect(drawer?.textContent).toContain("Files");
    expect(drawer?.textContent).toContain("Search");
    expect(drawer?.textContent).toContain("Settings");
  });

  it("closes the drawer after choosing a panel and reveals it full width", async () => {
    const host = await render();
    await click(host, "Menu");
    const drawer = visibleDialog(host, "Navigation");
    expect(drawer).not.toBeNull();

    // Scoped to the drawer deliberately: the hub carries a "Search" slot of its
    // own and comes first in the DOM, so an unscoped query would match that one
    // and prove nothing about the drawer row.
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

  it("keeps the hub visible while a panel is revealed", async () => {
    const host = await render();

    await click(host, "Search");

    expect(host.querySelector('[aria-label="Search panel"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Primary navigation"]')).not.toBeNull();
  });

  it("opens the action items menu — not an inspector — from the header's document tools button", async () => {
    const host = await render();
    expect(inspector(host)).toBeNull();

    await click(host, "Document tools");

    const menu = actionsMenu(host);
    expect(menu).not.toBeNull();
    expect(menu?.querySelector('[role="menuitem"][aria-label="Outline"]')).not.toBeNull();
    // The menu alone does not open an inspector.
    expect(inspector(host)).toBeNull();
  });

  it("drills actions → inspector, and the inspector's Back returns to the menu", async () => {
    const host = await render();
    await click(host, "Document tools");

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
    await click(host, "Document tools");
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

  // `revealPanel` used to set `revealed` for any panel id while the content
  // branch only ever renders a *left* popout, so the default Assistant hub slot
  // full-screened the Files panel instead of opening an inspector.
  it("opens the inspector from the assistant hub shortcut, parented to content", async () => {
    const host = await render();

    const hub = host.querySelector('[aria-label="Primary navigation"]');
    await act(async () => {
      hub?.querySelector<HTMLButtonElement>('[aria-label="Assistant"]')?.click();
    });

    expect(inspector(host)).not.toBeNull();
    expect(inspector(host)?.querySelector('[aria-label="Assistant panel"]')).not.toBeNull();
    // The drawer opens over the current route — Files at cold start — without
    // navigating: the Files surface stays mounted underneath.
    expect(host.querySelector('[aria-label="Files panel"]')).not.toBeNull();
  });

  it("returns straight to content on Back from a hub-opened inspector", async () => {
    const host = await render();
    const hub = host.querySelector('[aria-label="Primary navigation"]');
    await act(async () => {
      hub?.querySelector<HTMLButtonElement>('[aria-label="Assistant"]')?.click();
    });
    expect(inspector(host)).not.toBeNull();

    await act(async () => {
      inspector(host)?.querySelector<HTMLButtonElement>('[aria-label="Back from Assistant"]')?.click();
    });

    // Content-parented: Back lands on content, not on an action-items menu.
    expect(inspector(host)).toBeNull();
    expect(actionsMenu(host)).toBeNull();
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

    // Dismissing the sheet must leave its content mounted so the slide-down
    // close animation has something to animate, matching InspectorSheet.
    // `role="dialog"` is omitted when closed (to avoid contradicting
    // `aria-hidden`), so query by `aria-label` alone.
    await act(async () => shell().updateBottomPanel(null));
    const closed = host.querySelector('[aria-label="Tools"][aria-hidden]');
    expect(closed?.getAttribute("aria-hidden")).toBe("true");
    expect(closed?.querySelector('[aria-label="Bottom panel tabs"]')).not.toBeNull();
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
    await click(host, "Menu");

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
    await click(host, "Menu");
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
    await click(host, "Menu");

    // Scoped to the drawer: the hub renders its own slots with the same labels.
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

    await click(host, "Search");

    const panel = host.querySelector('[aria-label="Search panel"]');
    expect(panel?.closest(".tn-slide-in-left")).not.toBeNull();
  });

  it("clears the drawer highlight after going back from a revealed panel", async () => {
    const { host, shell } = await renderWithShell();
    await click(host, "Search");
    expect(host.querySelector('[aria-label="Search panel"]')).not.toBeNull();
    expect(shell().leftPanel).toBe("search");

    await click(host, "Back");

    // Back lands on the Files route, so the shell's left panel follows it to
    // explorer rather than being left lit on the panel that just closed.
    expect(host.querySelector('[aria-label="Search panel"]')).toBeNull();
    expect(shell().leftPanel).toBe("explorer");
    expect(hubOf(host)?.querySelector('[aria-label="Search"]')?.getAttribute("aria-current")).toBeNull();
    expect(drawerOf(host)?.querySelector('[aria-label="Search"]')?.getAttribute("aria-current")).toBeNull();
  });

  it("offers Saved versions only inside the action-items menu", async () => {
    const host = await render();

    // The phone header carries no sync/version control at all.
    expect(host.querySelector('header [aria-label="Saved versions"]')).toBeNull();

    await click(host, "Document tools");
    const row = actionsMenu(host)?.querySelector<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Saved versions"]'
    );
    expect(row).not.toBeNull();

    await act(async () => row?.click());

    // Replacing the menu's entry lands straight on the panel — the menu is
    // closed, not buried one Back step deep.
    expect(host.querySelector('[aria-label="Saved versions panel"]')).not.toBeNull();
    expect(actionsMenu(host)).toBeNull();
  });

  it("clears a note-specific version filter when the drawer opens Saved versions", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    await act(async () => shell().showVersionsOf("/vault", "note.md"));
    expect(shell().versionsOf).toBe("note.md");

    await act(async () => {
      hubOf(host)?.querySelector<HTMLButtonElement>('[aria-label="Menu"]')?.click();
    });
    const drawer = visibleDialog(host, "Navigation");
    await act(async () => {
      drawer?.querySelector<HTMLButtonElement>('[aria-label="Saved versions"]')?.click();
    });

    // Both Saved versions entry points now agree: whole workspace, no filter.
    expect(shell().versionsOf).toBeNull();
    expect(host.querySelector('[aria-label="Saved versions panel"]')).not.toBeNull();
  });

  it("bounds the drawer panel and scrim above the hub", async () => {
    const host = await render();

    await act(async () => {
      hubOf(host)?.querySelector<HTMLButtonElement>('[aria-label="Menu"]')?.click();
    });
    const drawer = visibleDialog(host, "Navigation");
    // Several scrims stay mounted (drawer, inspector, sheets) — the drawer's
    // own is the element immediately preceding its panel.
    const scrim = drawer?.previousElementSibling;
    expect(scrim?.getAttribute("data-tn-scrim")).not.toBeNull();

    const bound = "bottom-[calc(3.5rem+env(safe-area-inset-bottom))]";
    expect(drawer?.className).toContain(bound);
    expect(scrim?.className).toContain(bound);

    // The Menu slot stays tappable underneath: a second tap closes the drawer.
    await act(async () => {
      hubOf(host)?.querySelector<HTMLButtonElement>('[aria-label="Menu"]')?.click();
    });
    expect(visibleDialog(host, "Navigation")).toBeNull();
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
