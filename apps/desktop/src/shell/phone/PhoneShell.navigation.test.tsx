// @vitest-environment happy-dom
import { buildWikiLinkIndex, parseNote } from "@thinkbrain/core";
import { act, useState } from "react";
import { afterAll, describe, expect, it, vi } from "vitest";

import {
  actionsMenu,
  backButton,
  click,
  filesPanel,
  filesVisible,
  forwardButton,
  bubbleBar,
  inspector,
  locationPill,
  mount,
  newNoteMenu,
  noteTitle,
  noteTitleVisible,
  openReadyNote,
  render,
  renderWithShell,
  tapBubble,
  visibleDialog
} from "./PhoneShell.testHarness";
import { desktopCommandRegistry } from "../../commands/commandRegistry";
import { mobileNewNoteActionRegistry } from "../../commands/mobileNewNoteActionRegistry";
import { desktopPanelRegistry } from "../../panels/panelRegistryModel";
import { createVersionDiffTab } from "../../tabs/tabModel";
import { useShellState, type ShellState } from "../useShellState";
import { PhoneShell } from "./PhoneShell";
import { useWikiLinkIndexStore } from "../../wikiLinks/wikiLinkIndexStore";

// Opening a version-diff tab mounts VersionDiffTab, which reads the comparison
// through the sync service — the bare harness mock resolves null and would
// crash the surface. Answer with a real payload; the breadcrumb is under test,
// not the diff.
vi.mock("../../sync/syncService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../sync/syncService")>();
  return {
    ...actual,
    readVersionDiff: vi.fn(async () => ({
      kind: "text",
      change: "chg-1",
      notePath: "docs/deep/note.md",
      text: { current: "current\n", recorded: "recorded\n" }
    }))
  };
});

// A right-side extension panel gated on document context, so the action-items
// menu has a real "needs an open note" entry to disable on Files.
const docGatedPanel = desktopPanelRegistry.register({
  id: "hello-notes.doc-panel",
  label: "Doc panel",
  icon: "outline",
  side: "right",
  availability: (context) => context.documentContents != null,
  factory: () => <p>doc panel</p>
});

afterAll(() => {
  docGatedPanel.dispose();
});

// The New-note bubble, specifically — the Files panel has its own New-note
// button now, so an unscoped `click(host, …)` hits the explorer header first.
const tapNewNoteBubble = async (host: HTMLDivElement): Promise<void> =>
  tapBubble(host, "new-note");

// The ⋮ bubble, likewise — "Actions" names both the trigger and its menu.
const tapActionsBubble = async (host: HTMLDivElement): Promise<void> =>
  tapBubble(host, "actions");

describe("PhoneShell navigation", () => {
  it("starts on Files, not on the note, at cold launch", async () => {
    const host = await render();

    expect(locationPill(host)).toContain("Files");
    expect(filesVisible(host)).toBe(true);
    // Back remains visible and dimmed at the root; Forward has no useful target
    // and stays out of the header until a Back creates one.
    expect(backButton(host)?.disabled).toBe(true);
    expect(forwardButton(host)).toBeNull();
    expect(host.querySelector('[aria-label="Open navigation"]')).toBeNull();
  });

  it("starts on Files even when a tab was already active before the shell mounted", async () => {
    // Simulates session restore: the tab exists and is active before
    // PhoneShell's navigation seeds, so it must be observed, not pushed.
    const box: { current: ShellState | null; show?: () => void } = { current: null };
    const Host = () => {
      const shell = useShellState();
      box.current = shell;
      const [show, setShow] = useState(false);
      box.show = () => setShow(true);
      return show ? <PhoneShell shell={shell} /> : null;
    };
    const container = await mount(<Host />);
    await act(async () => box.current?.openMarkdownDocument("/vault", "note.md"));
    expect(box.current?.tabState.activeTabId).not.toBeNull();

    await act(async () => box.show?.());

    expect(locationPill(container!)).toContain("Files");
    expect(filesVisible(container!)).toBe(true);
    expect(backButton(container!)?.disabled).toBe(true);
    // The already-open tab is still open, just not the visible route.
    expect(box.current?.tabState.tabs).toHaveLength(1);
  });

  it("opens a note over Files and Back returns to Files without closing the tab", async () => {
    const { host, shell } = await renderWithShell();
    expect(filesVisible(host)).toBe(true);

    // An open that bypasses the phone wrappers (extension command, workspace
    // bridge) is still captured as a history entry.
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));

    expect(noteTitleVisible(host)).toBe(true);
    expect(filesVisible(host)).toBe(false);

    await click(host, "Back");

    expect(filesVisible(host)).toBe(true);
    expect(noteTitleVisible(host)).toBe(false);
    expect(shell().tabState.tabs).toHaveLength(1);
  });

  it("walks note history backwards: A then B, Back returns to A", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "first.md"));
    await act(async () => shell().openMarkdownDocument("/vault", "second.md"));
    expect(noteTitle(host)?.value).toBe("second");

    await click(host, "Back");

    expect(noteTitleVisible(host)).toBe(true);
    expect(noteTitle(host)?.value).toBe("first");
    expect(shell().tabState.activeTabId).toBe(
      shell().tabState.tabs.find((tab) => tab.resource?.relativePath === "first.md")?.id
    );
  });

  it("Forward returns to the note after Back", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    expect(forwardButton(host)).toBeNull();

    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);
    expect(forwardButton(host)?.disabled).toBe(false);

    await click(host, "Forward");
    expect(noteTitleVisible(host)).toBe(true);
    expect(noteTitle(host)?.value).toBe("note");
    expect(forwardButton(host)).toBeNull();
  });

  it("opens and closes the action-items menu without adding it to history", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    await click(host, "Back");
    expect(forwardButton(host)?.disabled).toBe(false);

    await tapActionsBubble(host);
    expect(actionsMenu(host)).not.toBeNull();

    await click(host, "Back");
    expect(actionsMenu(host)).toBeNull();
    expect(filesVisible(host)).toBe(true);
    expect(forwardButton(host)?.disabled).toBe(false);

    await click(host, "Forward");
    expect(noteTitleVisible(host)).toBe(true);
    expect(actionsMenu(host)).toBeNull();
  });

  it("breadcrumbs a nested note as workspace, folders, filename without .md", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "docs/deep/note.md"));

    expect(locationPill(host)).toContain("docs");
    expect(locationPill(host)).toContain("deep");
    expect(locationPill(host)).toContain("note");
    expect(locationPill(host)).not.toContain(".md");
  });

  it("keeps the extension on a non-Markdown file tab", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openFileDocument("/vault", "assets/diagram.png"));

    expect(locationPill(host)).toContain("assets");
    expect(locationPill(host)).toContain("diagram.png");
  });

  it("breadcrumbs a restore preview as workspace, Restore, then the file path", async () => {
    const box: { current: ShellState | null } = { current: null };
    const Host = () => {
      const state = useShellState();
      box.current = state;
      return <PhoneShell shell={{ ...state, restoredWorkspacePath: "/vault" }} />;
    };
    const host = await mount(<Host />);
    // The timestamp-forwarding leg of compareVersion is covered in
    // useShellState.test; here the dispatch itself stands in for it so the
    // chrome's breadcrumb is what is under test.
    await act(async () =>
      box.current?.dispatchTabs({
        type: "open",
        tab: createVersionDiffTab(
          { rootPath: "/vault", relativePath: "docs/deep/note.md" },
          "chg-1",
          Date.UTC(2026, 7, 18, 12, 0, 0)
        )
      })
    );

    // The operation owns the trail — unlike the note route, the filename
    // keeps its `.md` extension.
    const pill = locationPill(host);
    // No workspace name in this fixture — the label falls back to the app name.
    expect(pill).toContain("ThinkBrain");
    expect(pill).toContain("Restore");
    expect(pill).toContain("docs");
    expect(pill).toContain("deep");
    expect(pill).toContain("note.md");
    expect(pill?.indexOf("Restore")).toBeLessThan(pill!.indexOf("docs"));
  });

  it("adds a history entry when a tab is chosen in the switcher", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "first.md"));
    await act(async () => shell().openMarkdownDocument("/vault", "second.md"));

    await click(host, "Open tabs (2)");
    const sheet = visibleDialog(host, "Open tabs");
    await act(async () => {
      sheet?.querySelector<HTMLButtonElement>('[aria-label="first.md"]')?.click();
    });

    expect(noteTitle(host)?.value).toBe("first");

    // The switch was a navigation: Back revisits the tab we came from.
    await click(host, "Back");
    expect(noteTitle(host)?.value).toBe("second");
  });

  it("keeps the tab switcher out of history: Back closes it and Forward cannot reopen it", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    expect(noteTitleVisible(host)).toBe(true);

    await click(host, "Open tabs (1)");
    expect(visibleDialog(host, "Open tabs")).not.toBeNull();

    // The switcher is ephemeral chrome: Back dismisses it in place — no
    // history entry was popped, so the note stays the branch tip.
    await click(host, "Back");
    expect(visibleDialog(host, "Open tabs")).toBeNull();
    expect(noteTitleVisible(host)).toBe(true);
    expect(forwardButton(host)).toBeNull();

    // And the next Back still walks content history to Files.
    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);
  });

  it("reconciles a closed routed tab to the new active tab", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "first.md"));
    await act(async () => shell().openMarkdownDocument("/vault", "second.md"));
    const secondId = shell().tabState.activeTabId!;

    await act(async () => shell().dispatchTabs({ type: "requestClose", tabId: secondId }));

    // The stale entry is rewritten in place to the tab focus fell back to.
    expect(noteTitle(host)?.value).toBe("first");
    expect(filesVisible(host)).toBe(false);
  });

  it("stays on Files when the background active tab is closed from the switcher", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "first.md"));
    await act(async () => shell().openMarkdownDocument("/vault", "second.md"));
    // second.md is the active tab; Home parks it in the background over Files.
    await tapBubble(host, "home");
    expect(filesVisible(host)).toBe(true);

    await click(host, "Open tabs (2)");
    const sheet = visibleDialog(host, "Open tabs");
    expect(sheet).not.toBeNull();
    await act(async () => {
      sheet?.querySelector<HTMLButtonElement>('[aria-label="Close second.md"]')?.click();
    });

    // The reducer fell back to first.md, but that fallback is not a
    // navigation: the route stays Files instead of pushing the survivor's
    // tab route over it (and stranding Back on a ghost entry).
    expect(filesVisible(host)).toBe(true);
    expect(locationPill(host)).toContain("Files");
    expect(shell().tabState.tabs).toHaveLength(1);
    expect(shell().tabState.activeTabId).toBe(
      shell().tabState.tabs.find((tab) => tab.resource?.relativePath === "first.md")?.id
    );
    // Closing a tab from the switcher does not dismiss the sheet itself.
    expect(visibleDialog(host, "Open tabs")).not.toBeNull();
  });

  it("keeps Explorer mounted — hidden — while a note is on screen", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    expect(noteTitleVisible(host)).toBe(true);

    // Present in the DOM but inert: expansion, selection and scroll survive.
    const panel = filesPanel(host);
    expect(panel).not.toBeNull();
    expect(panel?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  // The action-items context is the *visible* route's document: on Files a
  // still-open note must not leak through, or document-gated panels would
  // stay clickable over the wrong content.
  it("disables document-gated options on Files even with a restored note active", async () => {
    const { host, shell } = await renderWithShell();
    await openReadyNote(shell);
    expect(noteTitleVisible(host)).toBe(true);

    // On the note route the gated option is live…
    await tapActionsBubble(host);
    const docItem = () =>
      actionsMenu(host)?.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Doc panel"]');
    expect(docItem()?.disabled).toBe(false);

    // Back dismisses the menu first, then content history reaches Files.
    await click(host, "Back");
    expect(actionsMenu(host)).toBeNull();
    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);

    // The same menu now shows the option disabled — the Files route carries
    // no document contents even though the note is still open.
    await tapActionsBubble(host);
    expect(docItem()?.disabled).toBe(true);
  });

  it("opens a backlink through the inspector without duplicating its existing tab", async () => {
    const index = buildWikiLinkIndex([
      {
        relativePath: "source.md",
        contents: "Link to [[target]]",
        parsedNote: parseNote("Link to [[target]]")
      },
      {
        relativePath: "target.md",
        contents: "Target",
        parsedNote: parseNote("Target")
      }
    ]);
    try {
      const box: { current: ShellState | null } = { current: null };
      const Host = () => {
        const state = useShellState();
        box.current = state;
        return <PhoneShell shell={{ ...state, restoredWorkspacePath: "/vault" }} />;
      };
      const host = await mount(<Host />);
      const shell = (): ShellState => {
        if (!box.current) throw new Error("PhoneShell did not render");
        return box.current;
      };
      await act(async () => shell().openMarkdownDocument("/vault", "source.md"));
      await act(async () => shell().openMarkdownDocument("/vault", "target.md"));
      await act(async () => useWikiLinkIndexStore.setState({
        rootPath: "/vault",
        status: "ready",
        wikiLinkIndex: index,
        noteIndex: index.noteIndex
      }));
      expect(noteTitle(host)?.value).toBe("target");
      expect(shell().tabState.tabs).toHaveLength(2);

      await tapActionsBubble(host);
      await act(async () => {
        actionsMenu(host)
          ?.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Backlinks"]')
          ?.click();
      });
      const backlink = inspector(host)?.querySelector<HTMLButtonElement>(
        '[aria-label="Open backlink from source"]'
      );
      expect(backlink).not.toBeNull();
      await act(async () => backlink?.click());

      expect(noteTitle(host)?.value).toBe("source");
      expect(inspector(host)).toBeNull();
      expect(shell().tabState.tabs).toHaveLength(2);

      await click(host, "Back");
      expect(noteTitle(host)?.value).toBe("target");
    } finally {
      await act(async () => useWikiLinkIndexStore.getState().clearWorkspace());
    }
  });

  it("the Home bubble navigates note → Files, and Back returns to the note", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    expect(noteTitleVisible(host)).toBe(true);

    await tapBubble(host, "home");
    expect(filesVisible(host)).toBe(true);
    expect(noteTitleVisible(host)).toBe(false);

    // Home pushes Files rather than toggling: Back revisits the note.
    await click(host, "Back");
    expect(noteTitleVisible(host)).toBe(true);
    expect(noteTitle(host)?.value).toBe("note");
  });

  it("reaches a left panel through the drawer", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));

    await click(host, "Main menu");
    await act(async () => {
      visibleDialog(host, "Navigation")
        ?.querySelector<HTMLButtonElement>('[aria-label="Search"]')
        ?.click();
    });
    expect(host.querySelector('[aria-label="Search panel"]')).not.toBeNull();
  });

  it("opens the Assistant inspector through the ⋮ menu and Back returns to it", async () => {
    const host = await render();

    await tapActionsBubble(host);
    await act(async () => {
      actionsMenu(host)
        ?.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Assistant"]')
        ?.click();
    });
    expect(inspector(host)).not.toBeNull();

    // The menu was the inspector's parent: one Back restores it.
    await click(host, "Back");
    expect(inspector(host)).toBeNull();
    expect(actionsMenu(host)).not.toBeNull();
  });

  it("toggles the main-menu drawer without adding it to history", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    await click(host, "Back");
    expect(forwardButton(host)?.disabled).toBe(false);

    await click(host, "Main menu");
    expect(visibleDialog(host, "Navigation")).not.toBeNull();

    await click(host, "Main menu");
    expect(visibleDialog(host, "Navigation")).toBeNull();
    expect(forwardButton(host)?.disabled).toBe(false);

    await click(host, "Forward");
    expect(noteTitleVisible(host)).toBe(true);
    expect(visibleDialog(host, "Navigation")).toBeNull();
  });

  it("toggles the New-note bubble and Create new note lands Files via the canonical command", async () => {
    const { host, shell } = await renderWithShell();

    await tapNewNoteBubble(host);
    expect(newNoteMenu(host)).not.toBeNull();

    // Second tap on the same bubble dismisses — it is a toggle, not a launcher.
    await tapNewNoteBubble(host);
    expect(newNoteMenu(host)).toBeNull();

    // Create runs the canonical command — Explorer's inline create flow over a
    // Files route. This fixture has no restored workspace (isTauri is mocked
    // false), so the tree never reaches `phase === "ready"` and the inline
    // field cannot render in this fixture. The Explorer integration suite proves
    // that this canonical focus request renders the `.md` field when ready.
    const focusRequests = () => shell().explorerProps.newNoteFocusRequest;
    await tapNewNoteBubble(host);
    await act(async () => {
      newNoteMenu(host)
        ?.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Create new note"]')
        ?.click();
    });

    expect(newNoteMenu(host)).toBeNull();
    expect(filesVisible(host)).toBe(true);
    expect(focusRequests()).toBeGreaterThan(0);
  });

  it("a tap on the New-note popup's own dismiss layer closes it without reopening", async () => {
    const { host } = await renderWithShell();
    await tapNewNoteBubble(host);
    expect(newNoteMenu(host)).not.toBeNull();

    // The popup's outside layer covers the bubbles (z-40 over z-20): the tap
    // that lands where the trigger bubble sits hits the layer, so the menu
    // closes and the same tap does not retrigger it.
    await act(async () => {
      host.querySelector('[data-tn-dismiss-layer="new-note"]')?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true })
      );
    });

    expect(newNoteMenu(host)).toBeNull();
  });

  it("Open most recent note restores the last open note's own tab", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    expect(noteTitleVisible(host)).toBe(true);

    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);

    await tapNewNoteBubble(host);
    const recent = newNoteMenu(host)?.querySelector<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Open most recent note"]'
    );
    expect(recent?.disabled).toBe(false);
    expect(recent?.textContent).toContain("note.md");

    await act(async () => recent?.click());

    expect(newNoteMenu(host)).toBeNull();
    expect(noteTitleVisible(host)).toBe(true);
    expect(noteTitle(host)?.value).toBe("note");
    // Reopened the same tab — it was never duplicated.
    expect(shell().tabState.tabs).toHaveLength(1);
  });

  it("swaps peer surfaces in place: New note → Assistant, Back lands on content", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));

    await tapNewNoteBubble(host);
    expect(newNoteMenu(host)).not.toBeNull();

    // The ⋮ bubble is under the popup's dismiss layer: tapping its spot first
    // closes the popup, and the second tap opens the actions menu.
    await act(async () => {
      host.querySelector('[data-tn-dismiss-layer="new-note"]')?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true })
      );
    });
    expect(newNoteMenu(host)).toBeNull();

    await tapActionsBubble(host);
    await act(async () => {
      actionsMenu(host)
        ?.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Assistant"]')
        ?.click();
    });
    expect(inspector(host)).not.toBeNull();

    await click(host, "Back");
    // One step back to the actions menu — the stale popup must not resurrect.
    expect(inspector(host)).toBeNull();
    expect(newNoteMenu(host)).toBeNull();
    await click(host, "Back");
    expect(noteTitleVisible(host)).toBe(true);
  });

  it("the Home bubble navigates over an open popup instead of stranding it", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));

    await tapNewNoteBubble(host);
    expect(newNoteMenu(host)).not.toBeNull();

    // Dismiss the popup first (its layer covers the bubbles), then Home.
    await act(async () => {
      host.querySelector('[data-tn-dismiss-layer="new-note"]')?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true })
      );
    });
    await tapBubble(host, "home");
    expect(newNoteMenu(host)).toBeNull();
    expect(filesVisible(host)).toBe(true);

    // The popup owned no entry: Files pushed over the note, so Back returns
    // to the note — not to a resurrected popup.
    await click(host, "Back");
    expect(noteTitleVisible(host)).toBe(true);
    expect(newNoteMenu(host)).toBeNull();
  });

  it("offers the previous distinct note while viewing a note, toggling A/B", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "a.md"));
    await act(async () => shell().openMarkdownDocument("/vault", "b.md"));
    expect(noteTitle(host)?.value).toBe("b");

    const recentRow = () =>
      newNoteMenu(host)?.querySelector<HTMLButtonElement>(
        '[role="menuitem"][aria-label="Open most recent note"]'
      );

    await tapNewNoteBubble(host);
    expect(recentRow()?.textContent).toContain("a.md");
    await act(async () => recentRow()?.click());

    expect(noteTitle(host)?.value).toBe("a");
    expect(shell().tabState.tabs).toHaveLength(2);

    // Selecting A refreshed the MRU: reopening on A now offers B.
    await tapNewNoteBubble(host);
    expect(recentRow()?.textContent).toContain("b.md");
    await act(async () => recentRow()?.click());

    expect(noteTitle(host)?.value).toBe("b");
    expect(shell().tabState.tabs).toHaveLength(2);
  });

  it("disables Open most recent note while viewing the only note", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "only.md"));

    await tapNewNoteBubble(host);
    const recent = newNoteMenu(host)?.querySelector<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Open most recent note"]'
    );
    expect(recent?.disabled).toBe(true);
  });

  it("runs a contributed action through its canonical command and stays closed", async () => {
    // Temporary singleton registrations prove the row resolves to and runs
    // the real command — the same path every other command takes.
    const handler = vi.fn();
    const actionReg = mobileNewNoteActionRegistry.register({
      id: "test.scratch",
      commandId: "test-scratch",
      label: "Scratch action",
      icon: "plus"
    });
    const commandReg = desktopCommandRegistry.register({
      id: "test-scratch",
      title: "Scratch action",
      availability: "available",
      handler
    });
    try {
      const host = await render();
      const newNoteButton = bubbleBar(host)?.querySelector<HTMLButtonElement>(
        '[data-bubble="new-note"]'
      );
      expect(newNoteButton).not.toBeNull();

      await act(async () => newNoteButton?.focus());
      await act(async () => newNoteButton?.click());
      const row = newNoteMenu(host)?.querySelector<HTMLButtonElement>(
        '[role="menuitem"][aria-label="Scratch action"]'
      );
      expect(row).not.toBeNull();
      await act(async () => row?.click());

      expect(handler).toHaveBeenCalledTimes(1);
      expect(newNoteMenu(host)).toBeNull();
      // Dismissed like every popup: focus returns to the bubble that opened it.
      expect(document.activeElement).toBe(newNoteButton);

      // Back lands on prior content — the popup entry was dismissed, not
      // buried one step deep, and nothing resurrects it.
      await click(host, "Back");
      expect(newNoteMenu(host)).toBeNull();
      expect(filesVisible(host)).toBe(true);
    } finally {
      await act(async () => {
        actionReg.dispose();
        commandReg.dispose();
      });
    }
  });

  it("a contributed row pointing at the new-note command creates instead of toggling the popup", async () => {
    const { host, shell } = await renderWithShell();
    // A contribution may alias the canonical command — the row must create a
    // note, not bounce the popup the bubble itself toggles.
    const actionReg = mobileNewNoteActionRegistry.register({
      id: "test.aliased-new-note",
      commandId: "new-note",
      label: "Aliased create",
      icon: "plus"
    });
    try {
      const focusRequests = () => shell().explorerProps.newNoteFocusRequest;
      const before = focusRequests() ?? 0;
      await tapNewNoteBubble(host);
      expect(newNoteMenu(host)).not.toBeNull();

      await act(async () => {
        newNoteMenu(host)
          ?.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Aliased create"]')
          ?.click();
      });

      // Created like the built-in row — not the bubble's open/close toggle,
      // which would have left Files untouched and simply shut the popup.
      expect(newNoteMenu(host)).toBeNull();
      expect(filesVisible(host)).toBe(true);
      expect(focusRequests()).toBeGreaterThan(before);
    } finally {
      await act(async () => actionReg.dispose());
    }
  });

  it("disables contributed rows for workspace gating and unavailable commands", async () => {
    // This fixture has no restored workspace, so requiresWorkspace rows must
    // render disabled rather than vanish. A command that reports itself
    // "unavailable" (the canonical availability field) disables its row the
    // same way — the row stays rendered either way.
    const actionReg = mobileNewNoteActionRegistry.register({
      id: "test.gated",
      commandId: "test-gated",
      label: "Gated action",
      icon: "plus",
      requiresWorkspace: true
    });
    const commandReg = desktopCommandRegistry.register({
      id: "test-gated",
      title: "Gated action",
      availability: "available",
      handler: () => undefined
    });
    const unavailableActionReg = mobileNewNoteActionRegistry.register({
      id: "test.unavailable",
      commandId: "test-unavailable",
      label: "Unavailable action",
      icon: "plus"
    });
    const unavailableCommandReg = desktopCommandRegistry.register({
      id: "test-unavailable",
      title: "Unavailable action",
      availability: "unavailable",
      handler: () => undefined
    });
    try {
      const host = await render();

      await tapNewNoteBubble(host);
      const row = newNoteMenu(host)?.querySelector<HTMLButtonElement>(
        '[role="menuitem"][aria-label="Gated action"]'
      );
      expect(row).not.toBeNull();
      expect(row?.disabled).toBe(true);
      const unavailableRow = newNoteMenu(host)?.querySelector<HTMLButtonElement>(
        '[role="menuitem"][aria-label="Unavailable action"]'
      );
      expect(unavailableRow).not.toBeNull();
      expect(unavailableRow?.disabled).toBe(true);
    } finally {
      await act(async () => {
        actionReg.dispose();
        commandReg.dispose();
        unavailableActionReg.dispose();
        unavailableCommandReg.dispose();
      });
    }
  });
});
