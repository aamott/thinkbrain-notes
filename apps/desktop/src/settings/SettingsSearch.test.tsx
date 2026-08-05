// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsTab } from "./SettingsTab";
import { useSettingsStore } from "./settingsStore";

/**
 * Settings search/filter component tests (Story 5).
 *
 * Uses the real module-scoped `useSettingsStore` singleton. Before each test,
 * state is seeded directly via `setState`. Rendering follows the codebase
 * convention: `createRoot` + `act` + DOM queries (no @testing-library/react).
 */

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** Default app values seeded into the store for most tests. */
const SEEDED_APP_VALUES: Record<string, unknown> = {
  "appearance.theme": "system",
  "editor.fontSize": 16,
  "editor.lineWrapping": true
};

beforeEach(() => {
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
  container?.remove();
  root = null;
  container = null;
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

describe("SettingsSearch", () => {
  it("renders a search input at the top of the nav", async () => {
    const el = await renderSettingsTab();

    const searchInput = el.querySelector<HTMLInputElement>(
      'input[aria-label="Search settings"]'
    );
    expect(searchInput).not.toBeNull();
    expect(searchInput?.placeholder).toBe("Search settings…");
  });

  it("filters definitions by label (case-insensitive)", async () => {
    await setSearchQuery("font");
    const el = await renderSettingsTab();

    // "Font size" result is present.
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

  it("clicking a result clears the query and sets the active section", async () => {
    // Start on a different section so we can verify navigation.
    useSettingsStore.setState({ activeSection: "appearance.theme" });
    await setSearchQuery("font");
    const el = await renderSettingsTab();

    const resultButton = Array.from(
      el.querySelectorAll<HTMLButtonElement>('[role="list"] button')
    ).find((b) => b.textContent?.includes("Font size"));
    expect(resultButton).toBeDefined();
    await click(resultButton!);

    // Query should be cleared.
    expect(useSettingsStore.getState().searchQuery).toBe("");
    // Active section should be the setting's section.
    expect(useSettingsStore.getState().activeSection).toBe("editor.display");
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

      // The matching row should have the highlight class.
      const highlightedRow = el.querySelector('[data-setting-key="editor.fontSize"]');
      expect(highlightedRow).not.toBeNull();
      expect(highlightedRow?.className).toContain("ring-ring");

      // Advance fake timers past the highlight duration; it should clear.
      await act(async () => {
        vi.advanceTimersByTime(1300);
      });

      const rowAfter = el.querySelector('[data-setting-key="editor.fontSize"]');
      expect(rowAfter?.className).not.toContain("ring-ring");
    } finally {
      vi.useRealTimers();
    }
  });
});
