// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  backButton,
  click,
  filesVisible,
  forwardButton,
  locationPill,
  noteTitle,
  noteTitleVisible,
  renderWithShell,
  tapBubble,
  visibleDialog
} from "./PhoneShell.testHarness";

// Drawer destinations (panels, Settings) push real history entries: Back
// revisits the surface they came from and Forward redoes the switch. The
// root Files entry must never be overwritten by deliberate navigation —
// the stale-tab/rename correction is the only surviving replace.

/** Picks a row inside the open navigation drawer by its aria-label. */
const drawerPick = async (host: HTMLDivElement, label: string): Promise<void> => {
  await click(host, "Main menu");
  const drawer = visibleDialog(host, "Navigation");
  if (!drawer) throw new Error("Navigation drawer did not open.");
  await act(async () => {
    drawer.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
  });
};

/** The routed depth written into the current history entry. */
const depth = (): number | undefined =>
  (window.history.state as { depth?: number } | null)?.depth;

const searchVisible = (host: HTMLDivElement): boolean =>
  host.querySelector('[aria-label="Search panel"]')?.closest('[aria-hidden="true"]') == null &&
  host.querySelector('[aria-label="Search panel"]') != null;

const settingsHeader = (host: HTMLDivElement): Element | null =>
  host.querySelector('[data-testid="settings-header-bar"]');
const settingsVisible = (host: HTMLDivElement): boolean =>
  settingsHeader(host)?.closest('[aria-hidden="true"]') == null && settingsHeader(host) != null;

// SettingsNav registers its drawer with the shared dismissable stack only
// under the narrow-viewport media query. Stub it for the tests that exercise
// header/system Back on the settings nav; `(pointer: coarse)` stays false as
// in the rest of the suite.
const stubNarrowViewport = (): void => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 760px)",
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    }))
  );
};

describe("PhoneShell drawer destinations", () => {
  it("Files → drawer Settings → Back → Files → Forward → Settings", async () => {
    const { host, shell } = await renderWithShell();
    expect(filesVisible(host)).toBe(true);

    await drawerPick(host, "Settings");
    expect(settingsVisible(host)).toBe(true);
    expect(locationPill(host)).toContain("Settings");
    // Exactly one entry: the explicit push is not doubled by the active-tab
    // observer, which sees the route already naming the settings tab.
    expect(depth()).toBe(1);

    // Choosing Settings again while already there is a same-route push —
    // the tab stays open and no duplicate entry lands.
    await drawerPick(host, "Settings");
    expect(depth()).toBe(1);

    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);
    // The settings tab itself was never closed — only the route changed.
    expect(shell().tabState.tabs.some((tab) => tab.id === "settings")).toBe(true);
    expect(forwardButton(host)?.disabled).toBe(false);

    await click(host, "Forward");
    expect(settingsVisible(host)).toBe(true);
    expect(locationPill(host)).toContain("Settings");
  });

  it("Files → drawer Search → Back → Files → Forward → Search", async () => {
    const { host } = await renderWithShell();

    await drawerPick(host, "Search");
    expect(searchVisible(host)).toBe(true);
    expect(depth()).toBe(1);

    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);
    expect(forwardButton(host)?.disabled).toBe(false);

    await click(host, "Forward");
    expect(searchVisible(host)).toBe(true);
  });

  it("Files → note → drawer Settings → Back → note → Back → Files", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    expect(noteTitleVisible(host)).toBe(true);

    await drawerPick(host, "Settings");
    expect(settingsVisible(host)).toBe(true);
    expect(depth()).toBe(2);

    await click(host, "Back");
    expect(noteTitleVisible(host)).toBe(true);
    expect(noteTitle(host)?.value).toBe("note");

    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);
    expect(backButton(host)?.disabled).toBe(true);
  });

  it("Files → Search → note → Back → Search → Back → Files", async () => {
    const { host, shell } = await renderWithShell();

    await drawerPick(host, "Search");
    expect(searchVisible(host)).toBe(true);

    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    expect(noteTitleVisible(host)).toBe(true);
    expect(depth()).toBe(2);

    await click(host, "Back");
    expect(searchVisible(host)).toBe(true);

    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);
    expect(backButton(host)?.disabled).toBe(true);
  });

  it("a new destination after Back truncates the Forward branch", async () => {
    const { host, shell } = await renderWithShell();
    await act(async () => shell().openMarkdownDocument("/vault", "note.md"));
    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);
    expect(forwardButton(host)?.disabled).toBe(false);

    await drawerPick(host, "Search");
    expect(searchVisible(host)).toBe(true);
    // The note entry was truncated: no Forward target remains.
    expect(forwardButton(host)?.disabled).toBe(true);

    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);
    await click(host, "Forward");
    expect(searchVisible(host)).toBe(true);
  });
});

describe("PhoneShell settings-nav overlay", () => {
  it("Back closes the open settings navigation without leaving Settings", async () => {
    stubNarrowViewport();
    const { host } = await renderWithShell();
    await drawerPick(host, "Settings");
    expect(depth()).toBe(1);

    await click(host, "Open settings navigation");
    expect(host.querySelector("#settings-navigation")?.getAttribute("data-open")).toBe("true");

    await click(host, "Back");
    expect(host.querySelector("#settings-navigation")?.getAttribute("data-open")).toBe("false");
    // The nav was an overlay, not a route: the settings screen and its one
    // history entry are untouched.
    expect(settingsVisible(host)).toBe(true);
    expect(depth()).toBe(1);

    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);
  });

  it("the Android Back bridge closes the open settings navigation first too", async () => {
    stubNarrowViewport();
    const { host } = await renderWithShell();
    await drawerPick(host, "Settings");

    await click(host, "Open settings navigation");
    expect(host.querySelector("#settings-navigation")?.getAttribute("data-open")).toBe("true");

    let consumed = false;
    await act(async () => {
      consumed = window.__thinkbrainHandleAndroidBack?.() === true;
    });
    expect(consumed).toBe(true);
    expect(host.querySelector("#settings-navigation")?.getAttribute("data-open")).toBe("false");
    expect(settingsVisible(host)).toBe(true);
    expect(depth()).toBe(1);
  });

  it("leaving Settings while its nav is open unregisters the overlay", async () => {
    stubNarrowViewport();
    const { host } = await renderWithShell();
    await drawerPick(host, "Settings");
    await click(host, "Open settings navigation");
    expect(host.querySelector("#settings-navigation")?.getAttribute("data-open")).toBe("true");

    // The Home bubble pushes a Files route over the still-mounted settings
    // tab; the hidden tab must close its drawer so the shared overlay stack
    // does not keep a focus trap alive behind an invisible surface.
    await tapBubble(host, "home");
    expect(filesVisible(host)).toBe(true);
    expect(host.querySelector("#settings-navigation")?.getAttribute("data-open")).toBe("false");

    // Back revisits Settings with the nav still closed, then Files.
    await click(host, "Back");
    expect(settingsVisible(host)).toBe(true);
    expect(host.querySelector("#settings-navigation")?.getAttribute("data-open")).toBe("false");
    await click(host, "Back");
    expect(filesVisible(host)).toBe(true);
    expect(backButton(host)?.disabled).toBe(true);

    // At the root nothing is left registered: the Android bridge declines,
    // handing Back to the system.
    let consumed = true;
    await act(async () => {
      consumed = window.__thinkbrainHandleAndroidBack?.() === true;
    });
    expect(consumed).toBe(false);

    // Forward revisits Settings with the nav still closed.
    await click(host, "Forward");
    expect(settingsVisible(host)).toBe(true);
    expect(host.querySelector("#settings-navigation")?.getAttribute("data-open")).toBe("false");
  });

  it("a direct browser Back while the nav is open leaves Files cleanly", async () => {
    stubNarrowViewport();
    const { host } = await renderWithShell();
    await drawerPick(host, "Settings");
    await click(host, "Open settings navigation");
    expect(host.querySelector("#settings-navigation")?.getAttribute("data-open")).toBe("true");

    // history.back() dispatches popstate asynchronously in happy-dom.
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(filesVisible(host)).toBe(true);
    expect(host.querySelector("#settings-navigation")?.getAttribute("data-open")).toBe("false");

    let consumed = true;
    await act(async () => {
      consumed = window.__thinkbrainHandleAndroidBack?.() === true;
    });
    expect(consumed).toBe(false);
  });
});
