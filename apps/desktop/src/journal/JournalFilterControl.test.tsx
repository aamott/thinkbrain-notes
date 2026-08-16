// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JournalFilterControl, type JournalFilterControlProps } from "./JournalFilterControl";
import type { JournalFacet } from "./journalFacets";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const facets: readonly JournalFacet[] = [
  { key: "mood", label: "Mood", values: ["good", "tired"] },
  { key: "rating", label: "Rating", values: [7] }
];

const render = async (
  overrides: Partial<JournalFilterControlProps> = {}
): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const props: JournalFilterControlProps = {
    facets,
    predicates: [],
    available: true,
    onToggle: () => undefined,
    ...overrides
  };
  await act(async () => root?.render(<JournalFilterControl {...props} />));
  return container;
};

const trigger = (host: HTMLElement): HTMLButtonElement => {
  const button = host.querySelector<HTMLButtonElement>("button");
  if (!button) throw new Error("no filter button");
  return button;
};

/**
 * A real press: the pointer goes down, the app reacts, and only then does the
 * click land. Batching the two would hide a menu that closes on the way down
 * and reopens on the way up.
 */
const press = async (host: HTMLElement): Promise<void> => {
  await act(async () => {
    trigger(host).dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
  await act(async () => trigger(host).click());
};

const items = (): HTMLButtonElement[] =>
  Array.from(document.body.querySelectorAll<HTMLButtonElement>("button[role='menuitemcheckbox']"));

describe("JournalFilterControl", () => {
  it("carries the active count in its accessible name, not only in the badge (D31)", async () => {
    const host = await render({ predicates: [{ key: "mood", value: "good" }] });
    expect(trigger(host).getAttribute("aria-label")).toBe("Filter entries, 1 filter active");
    expect(host.textContent).toContain("1");
  });

  it("names itself plainly when nothing is filtered", async () => {
    const host = await render();
    expect(trigger(host).getAttribute("aria-label")).toBe("Filter entries");
  });

  it("is disabled and says why when the index cannot answer (D41)", async () => {
    const host = await render({ available: false });
    expect(trigger(host).disabled).toBe(true);
    expect(trigger(host).title).toBe("Filters need the search index, which isn't ready.");
  });

  it("lists each field's values as checkboxes once opened", async () => {
    const host = await render({ predicates: [{ key: "mood", value: "good" }] });
    await press(host);
    const labels = items().map((item) => item.getAttribute("aria-label"));
    expect(labels).toEqual(["Mood good", "Mood tired", "Rating 7"]);
    expect(items().map((item) => item.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "false"
    ]);
  });

  it("reports the field and the value it was given, not the label shown", async () => {
    const onToggle = vi.fn();
    const host = await render({ onToggle });
    await press(host);
    await act(async () => items()[2]?.click());
    expect(onToggle).toHaveBeenCalledWith({ key: "rating", value: 7 });
  });

  it("leaves out a field nobody has used yet, rather than an empty heading", async () => {
    const host = await render({
      facets: [...facets, { key: "weather", label: "Weather", values: [] }]
    });

    await press(host);

    expect(document.body.textContent).not.toContain("Weather");
  });

  it("says there is nothing to filter by rather than opening an empty menu", async () => {
    const host = await render({ facets: [] });
    await press(host);
    expect(document.body.textContent).toContain("No metadata values yet.");
    expect(items()).toHaveLength(0);
  });

  it("steps between values with the arrow keys, like any other menu", async () => {
    const host = await render();
    await press(host);

    const menu = document.body.querySelector("[role='menu']");
    if (!menu) throw new Error("no menu");
    await act(async () => {
      menu.dispatchEvent(
        Object.assign(new Event("keydown", { bubbles: true }), { key: "ArrowDown" })
      );
    });

    expect(document.activeElement?.getAttribute("aria-label")).toBe("Mood tired");
  });

  it("closes when the trigger is pressed again", async () => {
    const host = await render();
    await press(host);
    expect(items().length).toBeGreaterThan(0);
    await press(host);
    expect(items()).toHaveLength(0);
    expect(trigger(host).getAttribute("aria-expanded")).toBe("false");
  });
});
