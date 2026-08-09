// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarDay, JournalDate } from "@thinkbrain/core";

import { CalendarTab, type CalendarTabProps } from "./CalendarTab";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const date = (iso: string): JournalDate => {
  const [year, month, day] = iso.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
};

const day = (count: number): CalendarDay => ({
  date: date("2026-08-07"),
  state: count > 0 ? "has-entries" : "empty",
  entries: [],
  count,
  visibleDots: Math.min(count, 3),
  overflow: Math.max(count - 3, 0),
  values: {},
  diagnostics: []
});

const render = async (overrides: Partial<CalendarTabProps> = {}): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const props: CalendarTabProps = {
    view: "month",
    focusDate: date("2026-08-12"),
    weekStartsOn: 0,
    today: date("2026-08-12"),
    selectedDay: null,
    days: new Map([["2026-08-07", day(8)]]),
    totalShowing: 1431,
    onViewChange: () => undefined,
    onFocusDate: () => undefined,
    onSelectDay: () => undefined,
    ...overrides
  };
  await act(async () => root?.render(<CalendarTab {...props} />));
  return container;
};

const cell = (host: HTMLElement, name: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll<HTMLButtonElement>('[role="gridcell"]')].find(
    (candidate) => candidate.getAttribute("aria-label")?.startsWith(name)
  );
  if (!found) throw new Error(`No cell for "${name}"`);
  return found;
};

describe("calendar rendering", () => {
  it("titles itself by the month and draws whole weeks", async () => {
    const host = await render();

    expect(host.textContent).toContain("August 2026");
    expect(host.querySelectorAll('[role="gridcell"]').length % 7).toBe(0);
  });

  it("caps the dots at three and shows the rest as a count (D46)", async () => {
    const host = await render();
    const august7 = cell(host, "Fri, 7");

    expect(august7.querySelectorAll("span.rounded-full")).toHaveLength(3);
    expect(august7.textContent).toContain("+5");
  });

  it("always names the exact count, whatever the cell shows", async () => {
    const host = await render();

    expect(cell(host, "Fri, 7").getAttribute("aria-label")).toBe(
      "Fri, 7, 8 journal entries"
    );
  });

  it("says a day with one entry in the singular", async () => {
    const host = await render({ days: new Map([["2026-08-07", day(1)]]) });

    expect(cell(host, "Fri, 7").getAttribute("aria-label")).toBe("Fri, 7, 1 journal entry");
  });

  it("marks today and the selected day differently", async () => {
    const host = await render({ selectedDay: date("2026-08-07") });

    expect(cell(host, "Wed, 12").getAttribute("aria-current")).toBe("date");
    expect(cell(host, "Fri, 7").getAttribute("aria-selected")).toBe("true");
  });

  it("orders the weekday headings by the configured week start", async () => {
    const host = await render({ weekStartsOn: 1 });

    expect(host.querySelector('[role="columnheader"]')?.textContent).toBe("Mon");
  });
});

describe("selecting a day", () => {
  it("reports the day rather than opening anything", async () => {
    const onSelectDay = vi.fn();
    const host = await render({ onSelectDay });

    await act(async () => cell(host, "Fri, 7").click());

    expect(onSelectDay).toHaveBeenCalledWith(date("2026-08-07"));
  });

  it("switches view when the strip is used", async () => {
    const onViewChange = vi.fn();
    const host = await render({ onViewChange });

    const week = [...host.querySelectorAll("button")].find((b) => b.textContent === "week");
    await act(async () => week?.click());

    expect(onViewChange).toHaveBeenCalledWith("week");
  });

  it("goes to today from the strip", async () => {
    const onFocusDate = vi.fn();
    const host = await render({ focusDate: date("2026-03-02"), onFocusDate });

    const today = [...host.querySelectorAll("button")].find((b) => b.textContent === "Today");
    await act(async () => today?.click());

    expect(onFocusDate).toHaveBeenCalledWith(date("2026-08-12"));
  });
});

describe("keyboard (D58)", () => {
  const press = async (host: HTMLElement, key: string, shiftKey = false): Promise<void> => {
    await act(async () => {
      cell(host, "Wed, 12").dispatchEvent(
        new KeyboardEvent("keydown", { key, shiftKey, bubbles: true })
      );
    });
  };

  it("is one tab stop", async () => {
    const host = await render();
    const focusable = [...host.querySelectorAll('[role="gridcell"]')].filter(
      (candidate) => candidate.getAttribute("tabindex") === "0"
    );

    expect(focusable).toHaveLength(1);
  });

  it.each([
    ["ArrowRight", false, "2026-08-13"],
    ["ArrowLeft", false, "2026-08-11"],
    ["ArrowDown", false, "2026-08-19"],
    ["ArrowUp", false, "2026-08-05"],
    ["Home", false, "2026-08-09"],
    ["End", false, "2026-08-15"],
    ["PageDown", false, "2026-09-12"],
    ["PageUp", false, "2026-07-12"],
    ["PageDown", true, "2027-08-12"],
    ["PageUp", true, "2025-08-12"]
  ])("moves on %s (shift: %s)", async (key, shiftKey, expected) => {
    const onFocusDate = vi.fn();
    const host = await render({ onFocusDate });

    await press(host, key, shiftKey);

    expect(onFocusDate).toHaveBeenCalledWith(date(expected));
  });

  it("activates the focused day with Enter", async () => {
    const onSelectDay = vi.fn();
    const host = await render({ onSelectDay });

    await press(host, "Enter");

    expect(onSelectDay).toHaveBeenCalledWith(date("2026-08-12"));
  });
});
