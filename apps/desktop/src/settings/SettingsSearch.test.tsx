// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsTab } from "./SettingsTab";
import { appSettingsRegistry, useSettingsStore } from "./settingsStore";

/**
 * Settings search/filter component tests (Story 5).
 *
 * Uses the real module-scoped `useSettingsStore` singleton. Before each test,
 * state is seeded directly via `setState`. Rendering follows the codebase
 * convention: `createRoot` + `act` + DOM queries (no @testing-library/react).
 */

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let temporaryRegistrations: Array<{ dispose(): void }> = [];

/** Default app values seeded into the store for most tests. */
const SEEDED_APP_VALUES: Record<string, unknown> = {
  "appearance.theme": "system",
  "appearance.themeFile": null,
  "editor.fontSize": 16,
  "editor.lineWrapping": true,
  "settings.autosave": false
};

beforeEach(() => {
  // happy-dom has no layout engine; give the virtualizer a deterministic
  // viewport while retaining the real @tanstack/react-virtual implementation.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    width: 224,
    height: 400,
    top: 0,
    right: 224,
    bottom: 400,
    left: 0,
    toJSON: () => ({})
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(224);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
  useSettingsStore.setState({
    appValues: { ...SEEDED_APP_VALUES },
    workspaceValues: null,
    workspaceRootPath: null,
    stagedChanges: {},
    isDirty: false,
    dirtyCount: 0,
    activeSection: "editor.display",
    searchQuery: "",
    loadError: null,
    saveError: null,
    validationDiagnostics: [],
    loaded: true
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  for (const registration of temporaryRegistrations) registration.dispose();
  temporaryRegistrations = [];
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

/**
 * Renders the SettingsTab into a fresh container and waits for effects.
 * Returns the container for querying.
 */
async function renderSettingsTab(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<SettingsTab />);
  });
  return container;
}

/** Sets the search query via the store and flushes React updates. */
async function setSearchQuery(query: string): Promise<void> {
  await act(async () => {
    useSettingsStore.setState({ searchQuery: query });
  });
}

/** Clicks an element and flushes React updates. */
async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

/** Types into React's controlled search input and flushes the input event. */
async function typeSearch(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  });
}

describe("SettingsSearch", () => {
  it("renders a search input at the top of the nav", async () => {
    const el = await renderSettingsTab();

    const searchInput = el.querySelector<HTMLInputElement>(
      'input[aria-label="Search settings"]'
    );
    expect(searchInput).not.toBeNull();
    expect(searchInput?.placeholder).toBe("Search settings…");
  });

  it("fuzzy matches non-consecutive label characters", async () => {
    await setSearchQuery("fnt");
    const el = await renderSettingsTab();

    const results = el.querySelectorAll('[role="list"] button');
    const labels = Array.from(results).map((b) => b.textContent);
    expect(labels.some((t) => t?.includes("Font size"))).toBe(true);
  });

  it("filters definitions by description", async () => {
    await setSearchQuery("wrap");
    const el = await renderSettingsTab();

    const results = el.querySelectorAll('[role="list"] button');
    const labels = Array.from(results).map((b) => b.textContent);
    expect(labels.some((t) => t?.includes("Line wrapping"))).toBe(true);
  });

  it("filters definitions by key", async () => {
    await setSearchQuery("line");
    const el = await renderSettingsTab();

    const results = el.querySelectorAll('[role="list"] button');
    const labels = Array.from(results).map((b) => b.textContent);
    expect(labels.some((t) => t?.includes("Line wrapping"))).toBe(true);
  });

  it("ranks a direct label match before weaker field matches", async () => {
    await setSearchQuery("theme");
    const el = await renderSettingsTab();

    const labels = Array.from(el.querySelectorAll('[role="list"] button')).map(
      (button) => button.querySelector("span")?.textContent
    );
    expect(labels[0]).toBe("Theme");
    expect(labels).toContain("Custom theme file");
  });

  it("debounces committed search updates by 150ms", async () => {
    vi.useFakeTimers();
    try {
      const el = await renderSettingsTab();
      const input = el.querySelector<HTMLInputElement>(
        'input[aria-label="Search settings"]'
      )!;

      await typeSearch(input, "fnt");
      expect(input.value).toBe("fnt");
      expect(useSettingsStore.getState().searchQuery).toBe("");

      await act(async () => {
        vi.advanceTimersByTime(149);
      });
      expect(useSettingsStore.getState().searchQuery).toBe("");

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(useSettingsStore.getState().searchQuery).toBe("fnt");
      expect(el.querySelector('[role="list"]')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders only the visible rows for 500+ matching settings", async () => {
    const sectionId = "virtual-search.results";
    temporaryRegistrations.push(
      appSettingsRegistry.register({
        id: "virtual-search",
        label: "Virtual Search",
        scope: "app",
        sections: [
          {
            id: sectionId,
            label: "Results",
            settings: Array.from({ length: 520 }, (_, index) => ({
              key: `option${index}`,
              type: "boolean" as const,
              default: false,
              scope: "app" as const,
              section: sectionId,
              label: `Virtual option ${index}`,
              description: "Bulk virtualization test setting"
            }))
          }
        ]
      })
    );
    await setSearchQuery("virtual option");
    const el = await renderSettingsTab();

    const list = el.querySelector<HTMLElement>('[role="list"]')!;
    const renderedRows = list.querySelectorAll("button");
    const totalRows = Number.parseFloat(list.style.height) / 52;
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(totalRows).toBeGreaterThanOrEqual(520);
    expect(renderedRows.length).toBeLessThan(totalRows);
  });

  it("shows the module/section path in results", async () => {
    await setSearchQuery("font");
    const el = await renderSettingsTab();

    expect(el.textContent).toContain("Editor > Display");
  });

  it("restores the tree view when the query is empty", async () => {
    // Start with a query, then clear it.
    await setSearchQuery("font");
    const el = await renderSettingsTab();
    expect(el.querySelector('[role="list"]')).not.toBeNull();

    await setSearchQuery("");
    expect(el.querySelector('[role="tree"]')).not.toBeNull();
    expect(el.querySelector('[role="list"]')).toBeNull();
  });

  it("clicking a result clears the query and scrolls to its section", async () => {
    await setSearchQuery("font");
    const el = await renderSettingsTab();
    const displaySection = el.querySelector<HTMLElement>(
      "#settings-section-app\\:editor\\.display"
    )!;
    const scrollSpy = vi.spyOn(displaySection, "scrollIntoView");

    // Capture whatever activeSection the scroll-spy set on mount; the click
    // should not change it.
    const activeBeforeClick = useSettingsStore.getState().activeSection;

    const resultButton = Array.from(
      el.querySelectorAll<HTMLButtonElement>('[role="list"] button')
    ).find((b) => b.textContent?.includes("Font size"));
    expect(resultButton).toBeDefined();
    await click(resultButton!);

    // Query should be cleared.
    expect(useSettingsStore.getState().searchQuery).toBe("");
    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start"
    });
    // The scroll-spy, not the result click, owns active state.
    expect(useSettingsStore.getState().activeSection).toBe(activeBeforeClick);
  });

  it("Escape clears the query and restores the tree", async () => {
    await setSearchQuery("font");
    const el = await renderSettingsTab();

    const input = el.querySelector<HTMLInputElement>(
      'input[aria-label="Search settings"]'
    );
    expect(input).not.toBeNull();

    await act(async () => {
      input!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });

    expect(useSettingsStore.getState().searchQuery).toBe("");
    expect(el.querySelector('[role="tree"]')).not.toBeNull();
  });

  it("shows a 'No results' message for a query matching nothing", async () => {
    await setSearchQuery("zzzzz");
    const el = await renderSettingsTab();

    expect(el.textContent).toContain("No results");
  });

  it("highlights the matching row in the content area after clicking a result", async () => {
    // Use fake timers so the highlight doesn't auto-clear before we assert.
    vi.useFakeTimers();
    try {
      useSettingsStore.setState({ activeSection: "appearance.theme" });
      await act(async () => {
        container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
        root?.render(<SettingsTab />);
      });
      await act(async () => {
        useSettingsStore.setState({ searchQuery: "font" });
      });

      const el = container!;
      const resultButton = Array.from(
        el.querySelectorAll<HTMLButtonElement>('[role="list"] button')
      ).find((b) => b.textContent?.includes("Font size"));
      expect(resultButton).toBeDefined();
      await act(async () => {
        resultButton!.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true })
        );
      });

      // The matching row should expose its highlighted state.
      const highlightedRow = el.querySelector('[data-setting-key="editor.fontSize"]');
      expect(highlightedRow).not.toBeNull();
      expect(highlightedRow?.getAttribute("data-highlighted")).toBe("true");

      // Advance fake timers past the highlight duration; it should clear.
      await act(async () => {
        vi.advanceTimersByTime(1300);
      });

      const rowAfter = el.querySelector('[data-setting-key="editor.fontSize"]');
      expect(rowAfter?.hasAttribute("data-highlighted")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
