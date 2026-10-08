// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PanelBoundary } from "./PanelBoundary";
import { Popout } from "./Popout";
import type { LeftPanelContext } from "./panelRegistryModel";

const context: LeftPanelContext = {
  rootPath: "/notes",
  explorerProps: {
    initialWorkspacePath: null,
    onWorkspaceOpened: () => undefined,
    onWorkspaceUnavailable: () => undefined,
    onMarkdownFileSelected: () => undefined,
    onMarkdownFileCreated: () => undefined,
    onNewNoteFocusHandled: () => undefined,
    newNoteFocusRequest: 0,
    onWorkspaceLaunched: () => undefined
  },
  onOpenSearchResult: () => undefined,
  onReviewConflict: () => undefined,
  onOpenSyncSettings: () => undefined
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(element: ReactNode): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(element));
}

beforeEach(() => {
  // React reports boundary-caught errors on console.error; silence the noise
  // while still letting assertions spy on the boundary's own report.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.mocked(console.error).mockRestore();
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function crashContribution(id: string, label: string, factory: (ctx: LeftPanelContext) => ReactNode) {
  return { id, label, icon: "x", side: "left" as const, factory };
}

describe("PanelBoundary", () => {
  it("swaps a thrown render for the fallback and reports the crash", async () => {
    await mount(
      <PanelBoundary label="Widget">
        <Throws />
      </PanelBoundary>
    );

    expect(host?.textContent).toContain("Widget could not be shown");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('"Widget" crashed.'),
      expect.any(Error),
      expect.anything()
    );
  });

  it("remounts the panel when Try again is clicked and the child recovers", async () => {
    let shouldThrow = true;
    const Flaky = (): ReactNode => {
      if (shouldThrow) throw new Error("boom");
      return <p>recovered</p>;
    };
    await mount(
      <PanelBoundary label="Widget">
        <Flaky />
      </PanelBoundary>
    );
    expect(host?.textContent).not.toContain("recovered");

    shouldThrow = false;
    await act(async () => {
      host?.querySelector<HTMLButtonElement>("button")?.click();
    });
    expect(host?.textContent).toContain("recovered");
  });

  it("renders a provided slim fallback instead of the full empty state", async () => {
    await mount(
      <PanelBoundary label="Widget" fallback={<div>row failed</div>}>
        <Throws />
      </PanelBoundary>
    );

    expect(host?.textContent).toBe("row failed");
  });
});

describe("Popout crash containment", () => {
  it("holds a crashing panel inside the dock while the chrome and aside survive", async () => {
    await mount(
      <Popout
        side="left"
        panel="search"
        context={context}
        contributions={[
          crashContribution("search", "Search", () => {
            throw new Error("search exploded");
          })
        ]}
      />
    );

    // The popout and its title row are still there; only the panel body
    // fell back — the shell above the popout is untouched.
    expect(host?.querySelector('[aria-label="Search panel"]')).not.toBeNull();
    expect(host?.querySelector("h2")?.textContent).toBe("Search");
    expect(host?.textContent).toContain("Search could not be shown");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('"Search" crashed.'),
      expect.any(Error),
      expect.anything()
    );
  });

  it("keeps sibling panels alive when one keepMounted panel crashes", async () => {
    await mount(
      <Popout
        side="left"
        panel="search"
        context={context}
        contributions={[
          crashContribution("search", "Search", () => <p>search body</p>),
          {
            ...crashContribution("extensions", "Extensions", () => {
              throw new Error("extensions exploded");
            }),
            keepMounted: true
          }
        ]}
      />
    );

    expect(host?.textContent).toContain("search body");
    expect(host?.textContent).toContain("Extensions could not be shown");
    expect(host?.querySelector("h2")?.textContent).toBe("Search");
  });
});

function Throws(): ReactNode {
  throw new Error("boom");
}
