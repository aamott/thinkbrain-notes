// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DocumentViewState } from "../shellTypes";
import type { DesktopTab } from "../../tabs/tabModel";
import { TabSwitcherSheet } from "./TabSwitcherSheet";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const tabs: readonly DesktopTab[] = [
  { id: "a", kind: "editor", title: "Note A" },
  { id: "b", kind: "editor", title: "Note B", isDirty: true },
  { id: "settings", kind: "settings", title: "Settings" }
];

const documents: Readonly<Record<string, DocumentViewState>> = {
  a: {
    phase: "ready",
    contents: "---\ntitle: A\n---\nAlpha body text.",
    diskContents: null,
    error: null
  },
  b: { phase: "ready", contents: "Bravo body text.", diskContents: null, error: null }
};

const render = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
};

const sheet = (overrides: Record<string, unknown> = {}): React.ReactElement => (
  <TabSwitcherSheet
    open
    tabs={tabs}
    activeTabId="a"
    documents={documents}
    onDismiss={() => undefined}
    onSelect={() => undefined}
    onClose={() => undefined}
    {...overrides}
  />
);

/**
 * Everything is queried through the sheet's own dialog rather than the document.
 * The sheet renders a scrim as a sibling and, in `PhoneShell`, sits beside a
 * header whose tab button carries a similar label — an unscoped query would be
 * free to match the wrong element and still go green.
 */
const grid = (host: HTMLDivElement): Element | null =>
  host.querySelector('[aria-label="Open tabs"]');

describe("TabSwitcherSheet", () => {
  it("renders nothing while closed", async () => {
    const host = await render(sheet({ open: false }));

    expect(grid(host)).toBeNull();
  });

  it("lays the tabs out as a grid, not a list", async () => {
    const host = await render(sheet());

    const list = grid(host)?.querySelector("ul");
    expect(list?.className).toContain("grid-cols-2");
    expect(list?.querySelectorAll("li")).toHaveLength(3);
  });

  it("previews a note's opening prose with frontmatter stripped", async () => {
    const host = await render(sheet());

    const card = grid(host)?.querySelector('[aria-label="Note A"]');
    expect(card?.textContent).toContain("Alpha body text.");
    expect(card?.textContent).not.toContain("title: A");
  });

  it("names the kind for a tab that has no text to preview", async () => {
    const host = await render(sheet());

    expect(grid(host)?.querySelector('[aria-label="Settings"]')?.textContent).toContain("settings");
  });

  // A restored tab whose contents are still in flight has an empty document, not
  // a missing one. Naming its kind ("editor") says nothing; the card has to say
  // that the text is coming.
  it("says a still-loading tab is loading rather than showing an empty card", async () => {
    const host = await render(
      sheet({
        documents: {
          ...documents,
          b: { phase: "loading", contents: "", diskContents: null, error: null }
        }
      })
    );

    const card = grid(host)?.querySelector('[aria-label="Note B"]');
    expect(card?.textContent).toContain("Loading");
    expect(card?.textContent).not.toContain("editor");
  });

  it("marks the active tab's card", async () => {
    const host = await render(sheet());

    expect(grid(host)?.querySelector('[aria-label="Note A"]')?.getAttribute("aria-current")).toBe(
      "page"
    );
    expect(
      grid(host)?.querySelector('[aria-label="Note B"]')?.getAttribute("aria-current")
    ).toBeNull();
  });

  it("marks a tab with unsaved changes", async () => {
    const host = await render(sheet());

    expect(
      grid(host)?.querySelector('[aria-label="Note B"] [aria-label="Unsaved changes"]')
    ).not.toBeNull();
    expect(
      grid(host)?.querySelector('[aria-label="Note A"] [aria-label="Unsaved changes"]')
    ).toBeNull();
  });

  it("selects a tab and dismisses itself", async () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    const host = await render(sheet({ onSelect, onDismiss }));

    await act(async () => {
      grid(host)?.querySelector<HTMLButtonElement>('[aria-label="Note B"]')?.click();
    });

    expect(onSelect).toHaveBeenCalledWith("b");
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  // The ✕ is a sibling of the select button, never a child of it: a nested
  // button is invalid HTML, and a click inside one would bubble into selection.
  it("closes a tab without selecting it or dismissing the grid", async () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    const host = await render(sheet({ onClose, onSelect, onDismiss }));

    const close = grid(host)?.querySelector<HTMLButtonElement>('[aria-label="Close Note B"]');
    expect(close?.closest("button")).toBe(close);

    await act(async () => close?.click());

    expect(onClose).toHaveBeenCalledWith("b");
    expect(onSelect).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("closes the active tab without selecting it or dismissing the grid", async () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    const host = await render(sheet({ onClose, onSelect, onDismiss }));

    await act(async () => {
      grid(host)?.querySelector<HTMLButtonElement>('[aria-label="Close Note A"]')?.click();
    });

    expect(onClose).toHaveBeenCalledWith("a");
    expect(onSelect).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  // Closing the last tab leaves the sheet open over an empty workspace. An empty
  // grid is a blank rectangle with no explanation, so the sheet says so instead.
  it("explains itself when the last tab has been closed", async () => {
    const host = await render(sheet({ tabs: [], activeTabId: null }));

    expect(grid(host)?.querySelector("ul")).toBeNull();
    expect(grid(host)?.textContent).toContain("No open tabs");
  });
});
