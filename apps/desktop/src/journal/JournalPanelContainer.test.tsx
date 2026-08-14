// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JournalPanelContainer } from "./JournalPanelContainer";
import {
  getJournalFilter,
  resetJournalFilter,
  selectJournalDay
} from "./journalFilterStore";
import { JournalError, type JournalListing, type JournalService } from "./journalService";
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
  if (parsed === UNDATED) throw new Error("not dated");
  return parsed;
};

const listing = (names: readonly string[]): JournalListing => ({
  entries: names.map((name) => ({ relativePath: `journal/${name}`, ref: ref(name) })),
  undated: []
});

const service = (overrides: Partial<JournalService> = {}): JournalService => ({
  listEntries: async () => listing(["2026-08-07-1802.md"]),
  createEntry: async () => "journal/2026-08-07-1900.md",
  openEntry: async () => undefined,
  renameEntry: async () => undefined,
  deleteEntry: async () => undefined,
  openToday: async () => "journal/2026-08-07-1802.md",
  readPreview: async () => null,
  ...overrides
});

const mount = async (props: Partial<Parameters<typeof JournalPanelContainer>[0]> = {}) => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <JournalPanelContainer
        service={props.service ?? service()}
        onOpenCalendar={props.onOpenCalendar ?? (() => undefined)}
        indexAvailable={props.indexAvailable}
      />
    )
  );
  return container;
};

const click = async (host: HTMLElement, name: string): Promise<void> => {
  const found = [...host.querySelectorAll("button")].find(
    (candidate) => candidate.getAttribute("aria-label") === name || candidate.textContent === name
  );
  if (!found) throw new Error(`No control named "${name}"`);
  await act(async () => found.click());
};

describe("journal panel container", () => {
  it("lists the folder's entries once they load", async () => {
    const host = await mount();

    expect(host.querySelector('[role="tree"]')).not.toBeNull();
    expect(host.textContent).toContain("Fri 7");
  });

  it("shows the approved copy when no workspace is open", async () => {
    const host = await mount({
      service: service({
        listEntries: async () => {
          throw new JournalError("no-workspace", "Open a folder to start journaling.", undefined);
        }
      })
    });

    expect(host.textContent).toContain("Open a folder to start journaling.");
  });

  it("shows the unreadable-folder state and retries from it", async () => {
    const listEntries = vi
      .fn<JournalService["listEntries"]>()
      .mockRejectedValueOnce(
        new JournalError("unreadable", "Can't read the journal folder.", "journal")
      )
      .mockResolvedValue(listing(["2026-08-07-1802.md"]));
    const host = await mount({ service: service({ listEntries }) });

    expect(host.textContent).toContain("Can't read the journal folder.");
    await click(host, "Retry");

    expect(host.querySelector('[role="tree"]')).not.toBeNull();
  });

  it("creates an entry and refreshes the list", async () => {
    const createEntry = vi.fn(async () => "journal/2026-08-07-1900.md");
    const listEntries = vi
      .fn<JournalService["listEntries"]>()
      .mockResolvedValueOnce(listing(["2026-08-07-1802.md"]))
      .mockResolvedValue(listing(["2026-08-07-1802.md", "2026-08-07-1900.md"]));
    const host = await mount({ service: service({ createEntry, listEntries }) });

    await click(host, "New journal entry");

    expect(createEntry).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("7:00 PM");
  });

  it("opens the entry a row names", async () => {
    const openEntry = vi.fn(async () => undefined);
    const host = await mount({ service: service({ openEntry }) });

    await click(host, "Fri 7, 6:02 PM");

    expect(openEntry).toHaveBeenCalledWith("journal/2026-08-07-1802.md");
  });

  it("collapses and reopens a group", async () => {
    const host = await mount();

    await click(host, "2026, 1 entry");
    expect(host.textContent).not.toContain("6:02 PM");

    await click(host, "2026, 1 entry");
    expect(host.textContent).toContain("6:02 PM");
  });

  it("keeps browsing usable while the index is unavailable", async () => {
    // D16's dependency degrades: search and facets go, the list stays.
    const host = await mount();

    expect(host.querySelector("input")?.disabled).toBe(true);
    expect(host.textContent).toContain("Search is unavailable");
    expect(host.querySelector('[role="tree"]')).not.toBeNull();
  });

  it("recovers to the truth after a failed action", async () => {
    const listEntries = vi
      .fn<JournalService["listEntries"]>()
      .mockResolvedValueOnce(listing(["2026-08-07-1802.md"]))
      .mockRejectedValue(
        new JournalError("unreadable", "Can't read the journal folder.", "journal")
      );
    const createEntry = vi.fn(async () => {
      throw new Error("disk full");
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const host = await mount({ service: service({ createEntry, listEntries }) });

    await click(host, "New journal entry");

    expect(host.textContent).toContain("Can't read the journal folder.");
    errors.mockRestore();
  });
});

describe("first-line previews", () => {
  it("shows each entry's first line once it has been read", async () => {
    const readPreview = vi.fn(async () => "Bread needed more salt.");
    const host = await mount({ service: service({ readPreview }) });

    await act(async () => {});

    expect(host.textContent).toContain("Bread needed more salt.");
    expect(readPreview).toHaveBeenCalledWith("journal/2026-08-07-1802.md");
  });

  it("draws the rows before any preview has loaded", async () => {
    // A slow disk must not delay the list itself.
    const readPreview = vi.fn(() => new Promise<string | null>(() => undefined));
    const host = await mount({ service: service({ readPreview }) });

    expect(host.textContent).toContain("Fri 7");
    expect(host.textContent).not.toContain("late");
  });

  /** 500 entries across August 2026, one per hour, so every filename differs. */
  const manyNames = Array.from({ length: 500 }, (_, index) => {
    const day = String(1 + Math.floor(index / 24)).padStart(2, "0");
    const hour = String(index % 24).padStart(2, "0");
    return `2026-08-${day}-${hour}00.md`;
  });

  const manyEntries = service({
    listEntries: async () => listing(manyNames)
  });

  it("reads a first line only for the rows on screen", async () => {
    const readPreview = vi.fn<JournalService["readPreview"]>(async () => "A line.");
    const host = await mount({
      service: service({ listEntries: manyEntries.listEntries, readPreview })
    });

    await act(async () => {});

    // A ten-year journal must never read ten years of files to draw one screen.
    expect(readPreview.mock.calls.length).toBeGreaterThan(0);
    expect(readPreview.mock.calls.length).toBeLessThan(50);
    // And what it did read is what the window is showing: the list runs newest
    // first, so the newest entry is read and the oldest is not touched.
    expect(readPreview).toHaveBeenCalledWith("journal/2026-08-21-1900.md");
    expect(readPreview).not.toHaveBeenCalledWith("journal/2026-08-01-0000.md");
    // Only entries have a first line to read; a year or month header has a group
    // key where a path would be, and reading it would be a round trip to nothing.
    const asked = readPreview.mock.calls.map(([path]) => path);
    expect(asked.every((path) => path.startsWith("journal/"))).toBe(true);
    expect(host.textContent).toContain("A line.");
  });

  it("reads the rows a scroll brought into view, and no row twice", async () => {
    const readPreview = vi.fn<JournalService["readPreview"]>(async () => "A line.");
    const host = await mount({
      service: service({ listEntries: manyEntries.listEntries, readPreview })
    });
    await act(async () => {});
    const before = readPreview.mock.calls.length;

    const list = host.querySelector<HTMLElement>('[role="tree"]');
    if (!list) throw new Error("The list did not render.");
    list.scrollTop = 4000;
    await act(async () => {
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await act(async () => {});

    const read = readPreview.mock.calls.map(([path]) => path);
    expect(read.length).toBeGreaterThan(before);
    expect(new Set(read).size).toBe(read.length);
  });

  /**
   * An entry whose first line could not be read must not be asked for again on
   * every scroll that passes over it — an unreadable file would otherwise cost a
   * round trip a frame.
   */
  it("does not keep re-reading an entry that had no first line", async () => {
    const readPreview = vi.fn<JournalService["readPreview"]>(async () => null);
    const host = await mount({
      service: service({ listEntries: manyEntries.listEntries, readPreview })
    });
    await act(async () => {});
    const first = readPreview.mock.calls.length;

    const list = host.querySelector<HTMLElement>('[role="tree"]');
    list!.scrollTop = 40;
    await act(async () => {
      list!.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await act(async () => {});

    const read = readPreview.mock.calls.map(([path]) => path);
    expect(new Set(read).size).toBe(read.length);
    expect(readPreview.mock.calls.length).toBeLessThan(first * 2);
  });
});

describe("the shared day filter (D25/D60)", () => {
  afterEach(() => resetJournalFilter());

  it("narrows the list to the day the calendar selected", async () => {
    const host = await mount({
      service: service({
        listEntries: async () => listing(["2026-08-07-1802.md", "2026-08-05-1307.md"])
      })
    });

    await act(async () => selectJournalDay({ year: 2026, month: 8, day: 5 }));

    expect(host.textContent).toContain("1:07 PM");
    expect(host.textContent).not.toContain("6:02 PM");
  });

  it("shows the day as a chip and says how many of how many", async () => {
    const host = await mount({
      service: service({
        listEntries: async () => listing(["2026-08-07-1802.md", "2026-08-05-1307.md"])
      })
    });

    await act(async () => selectJournalDay({ year: 2026, month: 8, day: 5 }));

    expect(host.textContent).toContain("2026-08-05");
    expect(host.textContent).toContain("Showing 1");
  });

  it("clears the calendar's selection when the chip is dismissed", async () => {
    const host = await mount();
    await act(async () => selectJournalDay({ year: 2026, month: 8, day: 5 }));

    await click(host, "Remove filter: 2026-08-05");

    expect(getJournalFilter().selectedDay).toBeNull();
  });
});

/**
 * The panel's search box was disabled by a missing argument rather than a
 * missing index: it defaulted to unavailable, and its `onSearchChange` went
 * nowhere. Enabling it without wiring it would have been worse than leaving it
 * off — a control that accepts typing and does nothing.
 */
describe("searching the journal", () => {
  const ENTRIES = ["2026-08-07-1802.md", "2026-08-08-0930.md"];

  const searchable = async (
    searchEntries: (query: string) => Promise<ReadonlySet<string>>
  ): Promise<HTMLDivElement> => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root?.render(
        <JournalPanelContainer
          service={service({ listEntries: async () => listing(ENTRIES) })}
          onOpenCalendar={() => undefined}
          indexAvailable
          searchEntries={searchEntries}
        />
      )
    );
    return container;
  };

  const typeSearch = async (host: HTMLElement, value: string): Promise<void> => {
    const field = host.querySelector<HTMLInputElement>('input[type="search"], input');
    if (!field) throw new Error("No search field.");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      setter?.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 260));
    });
  };

  it("filters the list to what the index matched", async () => {
    const host = await searchable(async () => new Set(["journal/2026-08-08-0930.md"]));

    await typeSearch(host, "salt");

    // Rows show the weekday and time, so the entries are told apart by those.
    const rows = [...host.querySelectorAll('[role="treeitem"]')].map((row) => row.textContent);
    expect(rows.join(" ")).toContain("9:30");
    expect(rows.join(" ")).not.toContain("6:02");
  });

  it("says so when the index matched nothing", async () => {
    const host = await searchable(async () => new Set<string>());

    await typeSearch(host, "nothing here");

    expect(host.textContent).toContain("No entries match");
  });

  it("shows everything again when the query is cleared", async () => {
    const host = await searchable(async () => new Set(["journal/2026-08-08-0930.md"]));
    await typeSearch(host, "salt");

    await typeSearch(host, "");

    const rows = [...host.querySelectorAll('[role="treeitem"]')].map((row) => row.textContent);
    expect(rows.join(" ")).toContain("6:02");
  });

  /** One query per pause, not one per keystroke: each is an IPC round trip. */
  it("does not query the index on every keystroke", async () => {
    const searchEntries = vi.fn(async () => new Set<string>());
    const host = await searchable(searchEntries);

    const field = host.querySelector<HTMLInputElement>("input");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      for (const value of ["s", "sa", "sal", "salt"]) {
        setter?.call(field, value);
        field?.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await new Promise((resolve) => setTimeout(resolve, 260));
    });

    expect(searchEntries).toHaveBeenCalledTimes(1);
    expect(searchEntries).toHaveBeenCalledWith("salt");
  });
});
