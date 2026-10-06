// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { BottomPanel as BottomPanelId } from "../shell/shellTypes";
import { BottomPanel } from "./BottomPanel";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** Keeps the controlled panel selection interactive for tab-content assertions. */
function BottomPanelHarness() {
  const [active, setActive] = useState<BottomPanelId>("terminal");

  return <BottomPanel active={active} onChange={setActive} onClose={() => undefined} />;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function renderBottomPanel() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<BottomPanelHarness />);
  });
}

async function selectTab(panel: BottomPanelId) {
  const tab = container?.querySelector<HTMLButtonElement>(`#bottom-panel-tab-${panel}`);
  if (!tab) throw new Error(`Could not find the ${panel} bottom-panel tab.`);

  await act(async () => {
    tab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("BottomPanel", () => {
  it("renders the terminal tab and its honest unavailable state", async () => {
    await renderBottomPanel();

    // The terminal tab is the only tab and is selected by default.
    expect(container?.querySelector(`#bottom-panel-tab-terminal`)?.getAttribute("aria-selected")).toBe("true");
    expect(container?.textContent).toContain("Terminal unavailable. Native terminal execution requires ACP capability work.");
  });

  it("keeps the terminal tab selected when re-clicked", async () => {
    await renderBottomPanel();

    await selectTab("terminal");

    expect(container?.querySelector(`#bottom-panel-tab-terminal`)?.getAttribute("aria-selected")).toBe("true");
    expect(container?.textContent).toContain("Terminal unavailable. Native terminal execution requires ACP capability work.");
  });

  it("does not render removed problems, output, or backlinks tabs", async () => {
    await renderBottomPanel();

    expect(container?.querySelector(`#bottom-panel-tab-problems`)).toBeNull();
    expect(container?.querySelector(`#bottom-panel-tab-output`)).toBeNull();
    expect(container?.querySelector(`#bottom-panel-tab-backlinks`)).toBeNull();
  });
});
