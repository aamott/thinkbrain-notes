// @vitest-environment happy-dom
import { parseJournalFilename, UNDATED, type JournalEntryRef } from "@thinkbrain/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalendarTabContainer } from "./CalendarTabContainer";
import { resetJournalFilter } from "./journalFilterStore";
import { JournalError, type JournalListing, type JournalService } from "./journalService";
import { appEvents } from "../events/appEvents";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  resetJournalFilter();
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

const now = (): Date => new Date(Date.UTC(2026, 7, 7));

const mount = async (
  props: Partial<Parameters<typeof CalendarTabContainer>[0]> = {}
): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <CalendarTabContainer
        service={props.service ?? service()}
        now={props.now ?? now}
        onChooseFolder={props.onChooseFolder}
        onOpenSettings={props.onOpenSettings}
      />
    )
  );
  return container;
};

/** The grid draws a dot per entry; the count is spoken in the cell's name. */
const dayName = (host: HTMLDivElement, day: number): string | null =>
  host
    .querySelector<HTMLButtonElement>(`[role="gridcell"][aria-label^="Fri, ${day},"]`)
    ?.getAttribute("aria-label") ?? null;

describe("the calendar's read errors", () => {
  it("names an unreadable folder instead of drawing an empty grid", async () => {
    const host = await mount({
      service: service({
        listEntries: () => {
          throw new JournalError("unreadable", "Can't read the journal folder.", undefined);
        }
      })
    });

    expect(host.textContent).toContain("Can't read the journal folder.");
    expect(host.querySelector('[role="grid"]')).toBeNull();
  });

  it("offers the folder when there is no workspace", async () => {
    const onChooseFolder = vi.fn();
    const host = await mount({
      service: service({
        listEntries: () => {
          throw new JournalError("no-workspace", "No workspace is open.", undefined);
        }
      }),
      onChooseFolder
    });

    expect(host.textContent).toContain("Open a folder to start journaling.");
    const open = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Open folder…"
    );
    await act(async () => open?.click());
    expect(onChooseFolder).toHaveBeenCalled();
  });

  it("sends an invalid journal root to settings", async () => {
    const host = await mount({
      service: service({
        listEntries: () => {
          throw new JournalError("invalid-root", "The journal folder isn't valid.", undefined);
        }
      }),
      onOpenSettings: () => undefined
    });

    expect(host.textContent).toContain("The journal folder setting isn't a valid path.");
  });

  it("draws the grid again when Retry succeeds", async () => {
    let fail = true;
    const host = await mount({
      service: service({
        listEntries: async () => {
          if (fail) throw new JournalError("unreadable", "Nope.", undefined);
          return listing(["2026-08-07-1802.md"]);
        }
      })
    });
    expect(host.querySelector('[role="grid"]')).toBeNull();

    fail = false;
    const retry = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Retry"
    );
    await act(async () => retry?.click());

    expect(host.querySelector('[role="grid"]')).not.toBeNull();
    expect(dayName(host, 7)).toContain("1 journal entry");
  });
});

describe("the calendar's freshness", () => {
  it("picks up an entry created while the tab is open", async () => {
    let entries = ["2026-08-07-1802.md"];
    const host = await mount({
      service: service({ listEntries: async () => listing(entries) })
    });
    expect(dayName(host, 7)).toContain("1 journal entry");

    entries = ["2026-08-07-1802.md", "2026-08-07-1930.md"];
    await act(async () => {
      appEvents.emit("note.created", {
        rootPath: "/vault",
        relativePath: "journal/2026-08-07-1930.md"
      });
    });

    expect(dayName(host, 7)).toContain("2 journal entries");
  });

  it("drops an entry deleted from the popout", async () => {
    let entries = ["2026-08-07-1802.md", "2026-08-07-1930.md"];
    const host = await mount({
      service: service({ listEntries: async () => listing(entries) })
    });
    expect(dayName(host, 7)).toContain("2 journal entries");

    entries = ["2026-08-07-1802.md"];
    await act(async () => {
      appEvents.emit("note.deleted", {
        rootPath: "/vault",
        relativePath: "journal/2026-08-07-1930.md"
      });
    });

    expect(dayName(host, 7)).toContain("1 journal entry");
  });

  it("follows an entry renamed out of the folder", async () => {
    let entries = ["2026-08-07-1802.md"];
    const host = await mount({
      service: service({ listEntries: async () => listing(entries) })
    });
    expect(dayName(host, 7)).toContain("1 journal entry");

    entries = [];
    await act(async () => {
      appEvents.emit("note.renamed", {
        rootPath: "/vault",
        oldRelativePath: "journal/2026-08-07-1802.md",
        newRelativePath: "notes/moved.md"
      });
    });

    expect(dayName(host, 7)).toContain("0 journal entries");
  });

  /**
   * A closed tab that keeps listening is invisible from the outside: React
   * drops its state updates silently, so the leak shows up only as a listener
   * the bus never lets go of. Watching the subscription itself is the only way
   * to see it.
   */
  it("releases its subscription when the tab is closed", async () => {
    const dispose = vi.fn();
    const on = vi.spyOn(appEvents, "on").mockReturnValue({ dispose });

    await mount();
    const subscribed = on.mock.calls.map(([event]) => event);
    expect(subscribed).toEqual(["note.created", "note.deleted", "note.renamed"]);

    await act(async () => root?.unmount());
    root = null;
    expect(dispose).toHaveBeenCalledTimes(subscribed.length);
    on.mockRestore();
  });
});
