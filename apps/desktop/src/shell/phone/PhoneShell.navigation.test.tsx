// @vitest-environment happy-dom
import { act, useState } from "react";
import { afterAll, describe, expect, it } from "vitest";

import {
  actionsMenu,
  backButton,
  click,
  filesPanel,
  filesVisible,
  forwardButton,
  hubOf,
  inspector,
  locationPill,
  mount,
  newNoteMenu,
  noteTitle,
  noteTitleVisible,
  openReadyNote,
  render,
  renderWithShell,
  visibleDialog
} from "./PhoneShell.testHarness";
import { desktopPanelRegistry } from "../../panels/panelRegistryModel";
import { useShellState, type ShellState } from "../useShellState";
import { PhoneShell } from "./PhoneShell";

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

describe("PhoneShell navigation", () => {
  it("starts on Files, not on the note, at cold launch", async () => {
    const host = await render();

    expect(locationPill(host)).toContain("Files");
    expect(filesVisible(host)).toBe(true);
    // The root of content history dims Back/Forward — always rendered, never
    // hidden, like a browser.
    expect(backButton(host)?.disabled).toBe(true);
    expect(forwardButton(host)?.disabled).toBe(true);
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
    expect(forwardButton(host)?.disabled).toBe(true);

    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);
    expect(forwardButton(host)?.disabled).toBe(false);

    await click(host, "Forward");
    expect(noteTitleVisible(host)).toBe(true);
    expect(noteTitle(host)?.value).toBe("note");
    expect(forwardButton(host)?.disabled).toBe(true);
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
    await click(host, "Document tools");
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
    await click(host, "Document tools");
    expect(docItem()?.disabled).toBe(true);
  });

  it("toggles the Files hub slot: note → Files → prior note", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    expect(noteTitleVisible(host)).toBe(true);

    await click(host, "Files");
    expect(filesVisible(host)).toBe(true);
    expect(noteTitleVisible(host)).toBe(false);

    await click(host, "Files");
    expect(noteTitleVisible(host)).toBe(true);
    expect(noteTitle(host)?.value).toBe("note");
  });

  it("toggles the Search hub slot: open, then back to prior content", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));

    await click(host, "Search");
    expect(host.querySelector('[aria-label="Search panel"]')).not.toBeNull();

    await click(host, "Search");
    expect(host.querySelector('[aria-label="Search panel"]')).toBeNull();
    expect(noteTitleVisible(host)).toBe(true);
  });

  it("toggles the Assistant hub slot: inspector opens, then closes", async () => {
    const host = await render();
    const hub = hubOf(host);

    await act(async () => {
      hub?.querySelector<HTMLButtonElement>('[aria-label="Assistant"]')?.click();
    });
    expect(inspector(host)).not.toBeNull();

    await act(async () => {
      hub?.querySelector<HTMLButtonElement>('[aria-label="Assistant"]')?.click();
    });
    expect(inspector(host)).toBeNull();
  });

  it("toggles the Menu hub slot: drawer opens, then closes", async () => {
    const host = await render();
    const hub = hubOf(host);

    await act(async () => {
      hub?.querySelector<HTMLButtonElement>('[aria-label="Menu"]')?.click();
    });
    expect(visibleDialog(host, "Navigation")).not.toBeNull();

    await act(async () => {
      hub?.querySelector<HTMLButtonElement>('[aria-label="Menu"]')?.click();
    });
    expect(visibleDialog(host, "Navigation")).toBeNull();
  });

  it("toggles the New note hub slot and Create new note lands Files via the canonical command", async () => {
    const { host, shell } = await renderWithShell();
    const hub = hubOf(host);

    await act(async () => {
      hub?.querySelector<HTMLButtonElement>('[aria-label="New note"]')?.click();
    });
    expect(newNoteMenu(host)).not.toBeNull();

    // Second tap on the same slot dismisses — it is a toggle, not a launcher.
    await act(async () => {
      hub?.querySelector<HTMLButtonElement>('[aria-label="New note"]')?.click();
    });
    expect(newNoteMenu(host)).toBeNull();

    // Create runs the canonical command — Explorer's inline create flow over a
    // Files route. This fixture has no restored workspace (isTauri is mocked
    // false), so the tree never reaches `phase === "ready"` and the inline
    // "New file name" field cannot render here; the observable dispatch is
    // the focus-request counter the command hands Explorer.
    const focusRequests = () => shell().explorerProps.newNoteFocusRequest;
    await act(async () => {
      hub?.querySelector<HTMLButtonElement>('[aria-label="New note"]')?.click();
    });
    await act(async () => {
      newNoteMenu(host)
        ?.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Create new note"]')
        ?.click();
    });

    expect(newNoteMenu(host)).toBeNull();
    expect(filesVisible(host)).toBe(true);
    expect(focusRequests()).toBeGreaterThan(0);
  });

  it("Open most recent note restores the last open note's own tab", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    expect(noteTitleVisible(host)).toBe(true);

    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);

    await click(host, "New note");
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
    const hub = hubOf(host);

    await act(async () => {
      hub?.querySelector<HTMLButtonElement>('[aria-label="New note"]')?.click();
    });
    expect(newNoteMenu(host)).not.toBeNull();

    // Assistant is a peer surface: it replaces the popup's history entry
    // rather than stacking over it.
    await act(async () => {
      hub?.querySelector<HTMLButtonElement>('[aria-label="Assistant"]')?.click();
    });
    expect(newNoteMenu(host)).toBeNull();
    expect(inspector(host)).not.toBeNull();

    await click(host, "Back");
    // One step: straight to the note — the stale popup must not resurrect.
    expect(inspector(host)).toBeNull();
    expect(newNoteMenu(host)).toBeNull();
    expect(noteTitleVisible(host)).toBe(true);
  });

  it("a hub left panel replaces an open overlay instead of stranding it", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    const hub = hubOf(host);

    await act(async () => {
      hub?.querySelector<HTMLButtonElement>('[aria-label="New note"]')?.click();
    });
    expect(newNoteMenu(host)).not.toBeNull();

    await act(async () => {
      hub?.querySelector<HTMLButtonElement>('[aria-label="Files"]')?.click();
    });
    expect(newNoteMenu(host)).toBeNull();
    expect(filesVisible(host)).toBe(true);

    // The popup's entry became the Files route, so Back returns to the note —
    // not to a resurrected popup.
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

    await click(host, "New note");
    expect(recentRow()?.textContent).toContain("a.md");
    await act(async () => recentRow()?.click());

    expect(noteTitle(host)?.value).toBe("a");
    expect(shell().tabState.tabs).toHaveLength(2);

    // Selecting A refreshed the MRU: reopening on A now offers B.
    await click(host, "New note");
    expect(recentRow()?.textContent).toContain("b.md");
    await act(async () => recentRow()?.click());

    expect(noteTitle(host)?.value).toBe("b");
    expect(shell().tabState.tabs).toHaveLength(2);
  });

  it("disables Open most recent note while viewing the only note", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "only.md"));

    await click(host, "New note");
    const recent = newNoteMenu(host)?.querySelector<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Open most recent note"]'
    );
    expect(recent?.disabled).toBe(true);
  });
});
