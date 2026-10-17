// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  actionsMenu,
  click,
  filesVisible,
  forwardButton,
  inspector,
  noteTitle,
  noteTitleVisible,
  openReadyNote,
  renderWithShell,
  tapBubble,
  visibleDialog
} from "./PhoneShell.testHarness";
// Imported after the harness so its `vi.mock` for this module is already
// registered — import order is the registration order.
import { workspaceDocumentApi } from "../../workspace/workspaceDocumentAdapter";
import { captureEditorLocation } from "../../tabs/editorLocationRegistry";

/**
 * Location-centric history through the whole phone chrome: real shell state,
 * a real CodeMirror view, and the browser-history route stack. The shared
 * `entries` log carries visit ids the routes bind to — these tests prove the
 * phone consumes the same semantics the desktop Back/Forward does.
 */
describe("PhoneShell location history", () => {
  it("an outline heading tap records a same-document visit; Back walks it, then Home", async () => {
    vi.mocked(workspaceDocumentApi.readMarkdownDocument).mockResolvedValueOnce({
      relative_path: "guide.md",
      contents:
        "# Guide\n\nAlpha text.\n\n## Beta Section\n\nBeta text.\n\n## Gamma Section\n\nGamma text."
    });
    // MarkdownEditor is a lazy Suspense child — warming the module cache
    // makes its React.lazy resolution land inside the open's act cycle, so
    // the live view registers before the heading tap needs it.
    await import("../../tabs/MarkdownEditor");
    const { host, shell } = await renderWithShell();
    await openReadyNote(shell, "guide.md");
    expect(noteTitleVisible(host)).toBe(true);
    expect(captureEditorLocation(shell().tabState.activeTabId ?? "")).toBeDefined();
    const historyDepth = () => (window.history.state as { depth?: number } | null)?.depth;

    // ⋮ → Outline opens the history-backed inspector over the note.
    await tapBubble(host, "actions");
    await act(async () => {
      actionsMenu(host)
        ?.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Outline"]')
        ?.click();
    });
    expect(inspector(host)).not.toBeNull();
    const inspectorDepth = historyDepth();
    const visitsBefore = shell().tabState.history.entries.length;

    // A heading tap records a same-document visit and consumes the
    // inspector's history slot — the sheet is gone, the editor is on screen,
    // and no second entry was stacked for the jump.
    const heading = [...(inspector(host)?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Beta Section"
    );
    expect(heading).toBeDefined();
    await act(async () => heading?.click());

    expect(inspector(host)).toBeNull();
    expect(noteTitleVisible(host)).toBe(true);
    expect(shell().tabState.history.entries).toHaveLength(visitsBefore + 1);
    expect(historyDepth()).toBe(inspectorDepth);

    // One Back returns to the pre-jump visit in the same note — not Files.
    await click(host, "Back");
    expect(noteTitleVisible(host)).toBe(true);
    expect(noteTitle(host)?.value).toBe("guide");
    expect(forwardButton(host)?.disabled).toBe(false);

    // One more Back reaches Files; at the root the Android bridge declines.
    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);
    expect(await act(async () => window.__thinkbrainHandleAndroidBack?.())).toBe(false);
  });

  it("reopens a displaced tab through its retained visit on Back", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "alpha.md"));
    const tabA = shell().tabState.tabs[0]!.id;

    // The phone opener fills the tab on screen: B displaces A outright, but
    // A's visit is retained — takeover is navigation, not a close.
    await act(async () => shell().openMarkdownDocument("/vault", "bravo.md", "replace-active"));
    expect(noteTitle(host)?.value).toBe("bravo");
    expect(shell().tabState.tabs).toHaveLength(1);

    // Back pops to A's bound visit; the restore reopens the retained
    // descriptor rather than stranding on a ghost entry.
    await click(host, "Back");

    expect(noteTitleVisible(host)).toBe(true);
    expect(noteTitle(host)?.value).toBe("alpha");
    expect(shell().tabState.activeTabId).toBe(tabA);
    expect(shell().tabState.tabs.map((tab) => tab.id)).toContain(tabA);
  });

  it("disables Forward when the only forward entry was scrubbed by a close", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "alpha.md"));
    await act(async () => shell().openMarkdownDocument("/vault", "bravo.md"));
    const tabB = shell().tabState.tabs[1]!.id;

    // Back to A's visit, then close B behind the route — B's forward entry
    // now names a visit the explicit close scrubbed.
    await click(host, "Back");
    expect(noteTitle(host)?.value).toBe("alpha");
    await act(async () => shell().dispatchTabs({ type: "requestClose", tabId: tabB }));
    expect(shell().tabState.tabs).toHaveLength(1);

    // Nothing live sits deeper: the header button and the palette command
    // both report there is nowhere to go.
    expect(forwardButton(host)?.disabled).toBe(true);
    const goForward = shell().paletteCommands.find((command) => command.id === "go-forward");
    expect(goForward?.availability).toBe("unavailable");

    // A raw OS-level forward pop onto the dead tail bounces back to A —
    // never a phantom Home and never the closed resource.
    await act(async () => window.history.forward());
    expect(noteTitle(host)?.value).toBe("alpha");
    expect(filesVisible(host)).toBe(false);
    expect(shell().tabState.tabs).toHaveLength(1);
  });

  it("skips the closed tab's visit in both directions", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "alpha.md"));
    await act(async () => shell().openMarkdownDocument("/vault", "bravo.md"));
    await act(async () => shell().openMarkdownDocument("/vault", "charlie.md"));
    const tabB = shell().tabState.tabs[1]!.id;

    // Back twice reaches A through B's (still live) route entry.
    await click(host, "Back");
    await click(host, "Back");
    expect(noteTitle(host)?.value).toBe("alpha");

    // Close B behind the route: Forward must step over its dead entry to C.
    await act(async () => shell().dispatchTabs({ type: "requestClose", tabId: tabB }));
    expect(forwardButton(host)?.disabled).toBe(false);
    await click(host, "Forward");
    expect(noteTitle(host)?.value).toBe("charlie");

    // Back from C skips B's dead entry the same way, landing on A.
    await click(host, "Back");
    expect(noteTitle(host)?.value).toBe("alpha");
    expect(shell().tabState.tabs).toHaveLength(2);
  });

  it("offers palette Back/Forward on Home→note even when tab history has nowhere to go", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    expect(noteTitleVisible(host)).toBe(true);
    // One visit deep in the shared tab history — the desktop derivation
    // alone would grey both commands out.
    const goBack = () => shell().paletteCommands.find((command) => command.id === "go-back");
    const goForward = () => shell().paletteCommands.find((command) => command.id === "go-forward");
    expect(goBack()?.availability).not.toBe("unavailable");

    // Running the command walks the phone's own route stack.
    await act(async () => shell().runCommand(goBack()!));
    expect(filesVisible(host)).toBe(true);
    expect(goForward()?.availability).not.toBe("unavailable");

    await act(async () => shell().runCommand(goForward()!));
    expect(noteTitleVisible(host)).toBe(true);
    expect(noteTitle(host)?.value).toBe("note");
  });

  it("the recent-note row records a fresh visit and clears Forward", async () => {
    const { host, shell } = await renderWithShell({ restoredWorkspacePath: "/vault" });
    await act(async () => shell().openMarkdownDocument("/vault", "alpha.md"));
    await act(async () => shell().openMarkdownDocument("/vault", "bravo.md"));
    const visitB = shell().tabState.history.entries.at(-1);

    // Back to A's visit, then pick B from the New-note menu: this is fresh
    // navigation through the ordinary opener, not a revisit of B's old visit.
    await click(host, "Back");
    expect(noteTitle(host)?.value).toBe("alpha");
    await tapBubble(host, "new-note");
    const recentRow = host.querySelector<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Open most recent note"]'
    );
    expect(recentRow?.textContent).toContain("bravo.md");
    await act(async () => recentRow?.click());

    expect(noteTitle(host)?.value).toBe("bravo");
    const current = shell().tabState.history.entries.at(-1);
    expect(current?.id).not.toBe(visitB?.id);
    expect(shell().tabState.history.entries).toHaveLength(2);
    expect(forwardButton(host)?.disabled).toBe(true);
    expect(shell().tabState.tabs).toHaveLength(2);
  });

  it("closing the only open note from the switcher lands Files, not a dead tab surface", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    expect(noteTitleVisible(host)).toBe(true);

    await click(host, "Open tabs (1)");
    const sheet = visibleDialog(host, "Open tabs");
    expect(sheet).not.toBeNull();
    await act(async () => {
      sheet?.querySelector<HTMLButtonElement>('[aria-label="Close note.md"]')?.click();
    });

    // No survivor visit exists, so the bound tab route must not stay dead —
    // Files shows, the note surface is gone, and Forward cannot reopen it.
    expect(filesVisible(host)).toBe(true);
    expect(noteTitleVisible(host)).toBe(false);
    expect(shell().tabState.tabs).toHaveLength(0);
    expect(forwardButton(host)?.disabled).toBe(true);
  });

  it("Android Back consumes the in-app step and declines at the root", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    const androidBack = () => window.__thinkbrainHandleAndroidBack?.();

    expect(await act(async () => androidBack())).toBe(true);
    expect(filesVisible(host)).toBe(true);
    expect(await act(async () => androidBack())).toBe(false);
  });
});
