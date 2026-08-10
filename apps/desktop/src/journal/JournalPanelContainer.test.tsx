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
