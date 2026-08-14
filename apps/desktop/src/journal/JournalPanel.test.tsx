// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JournalPanel, type JournalPanelProps } from "./JournalPanel";
import { buildJournalView, type JournalStatus } from "./journalViewModel";
import type { JournalListing } from "./journalService";
import { parseJournalFilename, UNDATED, type JournalEntryRef } from "@thinkbrain/core";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const ref = (name: string): JournalEntryRef => {
  const parsed = parseJournalFilename(name);
  if (parsed === UNDATED) throw new Error(`${name} is not dated`);
  return parsed;
};

const listing = (names: readonly string[]): JournalListing => ({
  entries: names.map((name) => ({ relativePath: `journal/${name}`, ref: ref(name) })),
  undated: []
});

const viewOf = (names: readonly string[], status: JournalStatus = "ready") =>
  buildJournalView({
    status,
    listing: status === "ready" ? listing(names) : null,
    collapsed: new Set<string>(),
    selectedDay: null,
    activeFilterCount: 0,
    matchingPaths: null,
    previews: new Map()
  });

const render = async (overrides: Partial<JournalPanelProps> = {}): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const props: JournalPanelProps = {
    view: viewOf(["2026-08-07-1802.md"]),
    search: "",
    searchAvailable: true,
    facetsAvailable: true,
    chips: [],
    onSearchChange: () => undefined,
    onNewEntry: () => undefined,
    onToday: () => undefined,
    onOpenCalendar: () => undefined,
    onOpenEntry: () => undefined,
    onToggleGroup: () => undefined,
    onRemoveChip: () => undefined,
    onClearFilters: () => undefined,
    onRetry: () => undefined,
    onChooseFolder: () => undefined,
    onOpenSettings: () => undefined,
    onCreateFolder: () => undefined,
    ...overrides
  };
  await act(async () => root?.render(<JournalPanel {...props} />));
  return container;
};

const button = (host: HTMLElement, name: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll("button")].find(
    (candidate) => candidate.getAttribute("aria-label") === name || candidate.textContent === name
  );
  if (!found) throw new Error(`No button named "${name}"`);
  return found;
};

describe("journal panel header (D71/D75)", () => {
  it("puts the actions above the search field, in the approved order", async () => {
    const host = await render();
    const controls = [...host.querySelectorAll("button, input")].map(
      (element) => element.getAttribute("aria-label") ?? element.tagName
    );

    expect(controls.slice(0, 4)).toEqual([
      "New journal entry",
      "Today",
      "Open journal calendar",
      "Search entries"
    ]);
  });

  it("runs the actions it was given", async () => {
    const onNewEntry = vi.fn();
    const onToday = vi.fn();
    const onOpenCalendar = vi.fn();
    const host = await render({ onNewEntry, onToday, onOpenCalendar });

    button(host, "New journal entry").click();
    button(host, "Today").click();
    button(host, "Open journal calendar").click();

    expect(onNewEntry).toHaveBeenCalledOnce();
    expect(onToday).toHaveBeenCalledOnce();
    expect(onOpenCalendar).toHaveBeenCalledOnce();
  });

  it("puts the active filter count in the filter button's accessible name", async () => {
    // The badge alone is not enough for a screen-reader user (D31).
    const host = await render({
      view: { ...viewOf(["2026-08-07-1802.md"]), activeFilterCount: 2 },
      chips: [
        { id: "day", label: "August 7" },
        { id: "context", label: "context: running" }
      ]
    });

    expect(button(host, "Filter entries, 2 filters active")).toBeDefined();
  });

  it("states how many entries are showing when a filter is active", async () => {
    const host = await render({
      view: { ...viewOf(["2026-08-07-1802.md"]), showing: 1, total: 1431, activeFilterCount: 1 },
      chips: [{ id: "day", label: "August 7" }]
    });

    expect(host.textContent).toContain("Showing 1");
    expect(host.textContent).toContain("1,431");
  });

  it("removes one filter without clearing the rest", async () => {
    const onRemoveChip = vi.fn();
    const host = await render({
      chips: [
        { id: "day", label: "August 7" },
        { id: "context", label: "context: running" }
      ],
      onRemoveChip
    });

    button(host, "Remove filter: August 7").click();

    expect(onRemoveChip).toHaveBeenCalledWith("day");
  });

  it("disables search and filters when the index is unavailable, and says why", async () => {
    const host = await render({ searchAvailable: false, facetsAvailable: false });

    expect(host.querySelector("input")?.disabled).toBe(true);
    expect(host.textContent).toContain("Search is unavailable");
    expect(host.textContent).toMatch(/browsing/i);
  });
});

describe("touch density (M-1, D76)", () => {
  /**
   * Touch decides, not width: a full-screen popout and a wide desktop panel are
   * the same number of pixels across, so the treatment rides on
   * `pointer-coarse:` and leaves the mouse layout alone.
   */
  const TOUCH_MINIMUM = /pointer-coarse:(min-h-11|h-11)/;

  it("gives every control a touch target under a fingertip", async () => {
    const host = await render({ chips: [{ id: "day", label: "7 August 2026" }] });

    const controls = [...host.querySelectorAll("button, input")];
    expect(controls.length).toBeGreaterThan(4);
    for (const control of controls) {
      expect(control.className).toMatch(TOUCH_MINIMUM);
    }
  });

  it("gives list rows the same minimum, keeping the two-line form", async () => {
    const host = await render();

    for (const row of host.querySelectorAll('[role="treeitem"]')) {
      expect(row.className).toMatch(TOUCH_MINIMUM);
    }
  });

  it("leaves the mouse layout compact", async () => {
    const host = await render();

    // The compact height is still the unprefixed class; only the coarse-pointer
    // variant is added on top of it.
    expect(button(host, "Today").className).toMatch(/(^|\s)h-7(\s|$)/);
  });
});

describe("journal panel list", () => {
  it("opens the entry a row names", async () => {
    const onOpenEntry = vi.fn();
    const host = await render({ onOpenEntry });

    button(host, "Fri 7, 6:02 PM").click();

    expect(onOpenEntry).toHaveBeenCalledWith("journal/2026-08-07-1802.md");
  });

  it("exposes collapsible headers with their state", async () => {
    const host = await render({ view: viewOf(["2026-08-07-1802.md"]) });
    const year = button(host, "2026, 1 entry");

    expect(year.getAttribute("aria-expanded")).toBe("true");
  });

  it("toggles a group when its header is activated", async () => {
    const onToggleGroup = vi.fn();
    const host = await render({ onToggleGroup });

    button(host, "2026, 1 entry").click();

    expect(onToggleGroup).toHaveBeenCalledWith("2026");
  });

  it("is one tab stop that moves between rows with the arrow keys", async () => {
    const host = await render({
      view: viewOf(["2026-08-07-1802.md", "2026-08-05-1307.md"])
    });
    const rows = [...host.querySelectorAll('[role="treeitem"]')];

    expect(rows.filter((row) => row.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(rows[0]?.getAttribute("tabindex")).toBe("0");

    await act(async () => {
      rows[0]?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
    });

    const after = [...host.querySelectorAll('[role="treeitem"]')];
    expect(after[1]?.getAttribute("tabindex")).toBe("0");
    expect(after[0]?.getAttribute("tabindex")).toBe("-1");
  });
});

describe("journal panel list at scale (D13)", () => {
  /** 500 entries across August 2026, one per hour, so every filename differs. */
  const manyNames = Array.from({ length: 500 }, (_, index) => {
    const day = String(1 + Math.floor(index / 24)).padStart(2, "0");
    const hour = String(index % 24).padStart(2, "0");
    return `2026-08-${day}-${hour}00.md`;
  });

  const treeitems = (host: HTMLElement): readonly Element[] => [
    ...host.querySelectorAll('[role="treeitem"]')
  ];

  const spaceAbove = (host: HTMLElement): string =>
    host.querySelector<HTMLElement>('[data-list-space="leading"]')?.style.height ?? "";

  it("draws a screenful of a long list rather than all of it", async () => {
    const host = await render({ view: viewOf(manyNames) });

    // 500 entries plus a year and a month header is 502 rows; a screenful is a
    // small fraction of that, and the exact count follows the estimated heights.
    // A screenful, not four rows and not five hundred: the lower bound is what
    // keeps the estimated viewport honest, since a test DOM reports no height
    // and the estimate is the only thing standing in for one.
    expect(treeitems(host).length).toBeGreaterThan(12);
    expect(treeitems(host).length).toBeLessThan(50);

    // The rest of the list is still there as height, or the scrollbar would
    // measure a screenful and scrolling would stop after one page.
    const below = host.querySelector<HTMLElement>('[data-list-space="trailing"]');
    expect(Number.parseFloat(below?.style.height ?? "0")).toBeGreaterThan(10_000);
  });

  /**
   * A row that grows a line when its preview arrives shoves every row below it
   * down, mid-scroll, and leaves the window measuring a shape the list no
   * longer has. So the line is there from the start, blank.
   */
  it("holds the preview's line before the preview arrives", async () => {
    const host = await render({ view: viewOf(["2026-08-07-1802.md"]) });
    const entry = host.querySelector('[data-row-kind="entry"]');

    const previewLine = entry?.querySelector(".truncate");
    expect(previewLine).not.toBeNull();
    expect(previewLine?.textContent).toBe("\u00a0");
  });

  /**
   * The rows are gone from the DOM, not from the list. Without these a screen
   * reader announces "1 of 20" partway down a list of hundreds, and the user is
   * told the list ends where the window does.
   */
  it("tells assistive tech the size of the list it is showing a slice of", async () => {
    const host = await render({ view: viewOf(manyNames) });
    const rows = treeitems(host);

    for (const row of rows) {
      expect(row.getAttribute("aria-setsize")).toBe("502");
    }
    expect(rows[0]?.getAttribute("aria-posinset")).toBe("1");
    expect(rows[1]?.getAttribute("aria-posinset")).toBe("2");
  });

  it("draws a different slice once scrolled, keeping the space above it", async () => {
    const host = await render({ view: viewOf(manyNames) });
    const list = host.querySelector<HTMLElement>('[role="tree"]');
    if (!list) throw new Error("The list did not render.");

    expect(spaceAbove(host)).toBe("0px");

    list.scrollTop = 4000;
    await act(async () => {
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    const first = Number(treeitems(host)[0]?.getAttribute("aria-posinset"));
    expect(first).toBeGreaterThan(1);
    expect(Number.parseFloat(spaceAbove(host))).toBeGreaterThan(0);
  });

  it("draws a short list whole, with no space held either side", async () => {
    const host = await render({ view: viewOf(["2026-08-07-1802.md"]) });

    expect(treeitems(host)).toHaveLength(3);
    expect(spaceAbove(host)).toBe("0px");
    expect(
      host.querySelector<HTMLElement>('[data-list-space="trailing"]')?.style.height
    ).toBe("0px");
  });
});

describe("journal panel states", () => {
  it("offers to open a folder when no workspace is open", async () => {
    const onChooseFolder = vi.fn();
    const host = await render({ view: viewOf([], "no-workspace"), onChooseFolder });

    expect(host.textContent).toContain("Open a folder to start journaling.");
    button(host, "Open folder…").click();
    expect(onChooseFolder).toHaveBeenCalledOnce();
  });

  it("offers a retry and a different folder when the folder cannot be read", async () => {
    const onRetry = vi.fn();
    const host = await render({ view: viewOf([], "unreadable"), onRetry });

    expect(host.textContent).toContain("Can't read the journal folder.");
    button(host, "Retry").click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("sends an invalid folder setting to settings", async () => {
    const onOpenSettings = vi.fn();
    const host = await render({ view: viewOf([], "invalid-root"), onOpenSettings });

    expect(host.textContent).toContain("The journal folder setting isn't a valid path.");
    button(host, "Open settings").click();
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("invites a first entry when the folder is empty", async () => {
    const host = await render({ view: viewOf([]) });

    expect(host.textContent).toContain("No entries yet.");
  });

  it("names the filter count when nothing matches, and clears them", async () => {
    const onClearFilters = vi.fn();
    const host = await render({
      view: {
        ...viewOf(["2026-08-07-1802.md"]),
        state: "no-matches" as const,
        rows: [],
        showing: 0,
        activeFilterCount: 3
      },
      onClearFilters
    });

    expect(host.textContent).toContain("No entries match these 3 filters.");
    button(host, "Clear all filters").click();
    expect(onClearFilters).toHaveBeenCalledOnce();
  });

  it("announces the list is loading", async () => {
    const host = await render({ view: viewOf([], "loading") });

    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
