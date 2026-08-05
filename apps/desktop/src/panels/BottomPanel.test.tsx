// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { BottomPanel as BottomPanelId } from "../shell/shellTypes";
import { BottomPanel } from "./BottomPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** Keeps the controlled panel selection interactive for tab-content assertions. */
function BottomPanelHarness() {
  const [active, setActive] = useState<BottomPanelId>("problems");

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
  it("shows each tab's honest empty or unavailable state when activated", async () => {
    await renderBottomPanel();

    const states: readonly [BottomPanelId, string][] = [
      ["problems", "No problems detected"],
      ["output", "No output yet. Indexer status will appear here."],
      ["terminal", "Terminal unavailable. Native terminal execution requires ACP capability work."],
      ["backlinks", "Backlinks preview unavailable. This requires the workspace link index."]
    ];

    for (const [panel, message] of states) {
      await selectTab(panel);

      expect(container?.textContent).toContain(message);
      expect(container?.querySelector(`#bottom-panel-tab-${panel}`)?.getAttribute("aria-selected")).toBe("true");
    }
  });
});
