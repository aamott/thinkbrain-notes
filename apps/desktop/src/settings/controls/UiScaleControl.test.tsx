// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SettingDefinition } from "@thinkbrain/core";

import { UI_SCALE_PRESETS } from "../uiModuleDefaults";
import { UiScaleControl } from "./UiScaleControl";

const DEFINITION = {
  key: "ui.scale",
  type: "number",
  min: 50,
  max: 200,
  default: 100,
  scope: "app",
  section: "ui.general",
  label: "Interface size"
} as SettingDefinition;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (value: unknown, onChange = vi.fn()) => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(<UiScaleControl definition={DEFINITION} value={value} onChange={onChange} />)
  );
  return { onChange, select: container.querySelector("select")! };
};

const changeSelect = async (select: HTMLSelectElement, value: string) => {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

describe("UiScaleControl", () => {
  it("offers the preset percents with the current value selected", async () => {
    const { select } = await render(100);
    const options = [...select.querySelectorAll("option")];
    expect(options.map((option) => option.textContent)).toEqual(
      UI_SCALE_PRESETS.map((percent) => `${percent}%`)
    );
    expect(select.value).toBe("100");
  });

  it("emits the chosen percent as a number", async () => {
    const { select, onChange } = await render(100);
    await changeSelect(select, "150");
    expect(onChange).toHaveBeenCalledWith(150);
  });

  it("shows an off-preset value (keyboard zoom, import) as its own option", async () => {
    const { select } = await render(120);
    const labels = [...select.querySelectorAll("option")].map((option) => option.textContent);
    expect(labels).toContain("120%");
    expect(select.value).toBe("120");
    // It lands in sorted order between the surrounding presets.
    expect(labels.indexOf("120%")).toBe(labels.indexOf("110%") + 1);
  });

  it("shows the placeholder rather than a blank when the value is not numeric", async () => {
    const { select } = await render("large");
    expect(select.value).toBe("");
    expect(select.querySelector("option:disabled")?.textContent).toBe("Select a value...");
  });
});
