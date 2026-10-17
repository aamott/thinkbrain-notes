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

    // B's trail rebased the browser segment to Home + its visits: Back goes
    // to Files, leaving B's entry in the Forward tail.
    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);
    await act(async () => shell().dispatchTabs({ type: "requestClose", tabId: tabB }));
    expect(shell().tabState.tabs).toHaveLength(1);

    // The forward entry named B's now-scrubbed visit: nothing live sits
    // deeper, so the header button and the palette command both grey out.
    expect(forwardButton(host)?.disabled).toBe(true);
    const goForward = shell().paletteCommands.find((command) => command.id === "go-forward");
    expect(goForward?.availability).toBe("unavailable");

    // A raw OS-level forward pop onto the dead tail bounces back to Files —
    // never a phantom note and never the closed resource.
    await act(async () => window.history.forward());
    expect(filesVisible(host)).toBe(true);
    expect(noteTitleVisible(host)).toBe(false);
    expect(shell().tabState.tabs).toHaveLength(1);
  });

  it("Back inside a trail never steps onto another tab's visits", async () => {
    const { host, shell } = await renderWithShell();
    // One trail: A replaced by B replaced by C in the same slot.
    await act(async () => shell().openMarkdownDocument("/vault", "alpha.md"));
    await act(async () =>
      shell().openMarkdownDocument("/vault", "bravo.md", "replace-active")
    );
    await act(async () =>
      shell().openMarkdownDocument("/vault", "charlie.md", "replace-active")
    );
    expect(shell().tabState.tabs).toHaveLength(1);

    await click(host, "Back");
    await click(host, "Back");
    expect(noteTitle(host)?.value).toBe("alpha");

    // Forward walks the same trail back to C — nothing else interleaves.
    await click(host, "Forward");
    await click(host, "Forward");
    expect(noteTitle(host)?.value).toBe("charlie");
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
    await act(async () =>
      shell().openMarkdownDocument("/vault", "bravo.md", "replace-active")
    );
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
    expect(shell().tabState.tabs).toHaveLength(1);
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

  it("a heading link jumps in place — no route push, no extra document", async () => {
    vi.mocked(workspaceDocumentApi.readMarkdownDocument).mockResolvedValueOnce({
      relative_path: "guide.md",
      contents:
        "# Guide\n\nSee [beta](#beta-section).\n\n## Beta Section\n\nBeta text."
    });
    await import("../../tabs/MarkdownEditor");
    const { host, shell } = await renderWithShell();
    await openReadyNote(shell, "guide.md");
    const tabId = shell().tabState.activeTabId!;
    const depth = () =>
      (window.history.state as { depth?: number } | null)?.depth ?? 0;
    const depthBefore = depth();
    const visitsBefore = shell().tabState.history.entries.length;

    // A same-note heading target jumps the live editor: the opener pushes
    // no route — only the recorded visit's own entry — and no document load.
    await act(async () => shell().onOpenLink({ kind: "heading", fragment: "beta-section" }));

    expect(depth()).toBe(depthBefore + 1);
    expect(noteTitle(host)?.value).toBe("guide");
    expect(shell().tabState.history.entries).toHaveLength(visitsBefore + 1);
    const location = captureEditorLocation(tabId);
    // Line 5, "## Beta Section", starts at offset 37 in the fixture.
    expect(location?.anchor).toBe(37);

    // Back restores the parked spot, Forward the heading — one entry each.
    await click(host, "Back");
    expect(depth()).toBe(depthBefore);
    expect(captureEditorLocation(tabId)?.anchor).toBe(0);
    await click(host, "Forward");
    expect(captureEditorLocation(tabId)?.anchor).toBe(37);
  });

  it("a missing heading link warns through a dismissible banner and records nothing", async () => {
    vi.mocked(workspaceDocumentApi.readMarkdownDocument).mockResolvedValueOnce({
      relative_path: "guide.md",
      contents: "# Guide\n\nBody."
    });
    await import("../../tabs/MarkdownEditor");
    const { host, shell } = await renderWithShell();
    await openReadyNote(shell, "guide.md");
    const visitsBefore = shell().tabState.history.entries.length;

    await act(async () => shell().onOpenLink({ kind: "heading", fragment: "nope" }));

    // The warning surfaces as an alert banner; history and the caret are
    // untouched — the jump simply did not happen.
    const banner = host.querySelector('[role="alert"]');
    expect(banner?.textContent).toContain("Heading not found");
    expect(banner?.textContent).toContain('"nope"');
    expect(shell().tabState.history.entries).toHaveLength(visitsBefore);

    const dismiss = banner?.querySelector<HTMLButtonElement>(
      'button[aria-label="Dismiss navigation warning"]'
    );
    expect(dismiss).toBeDefined();
    await act(async () => dismiss?.click());
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
