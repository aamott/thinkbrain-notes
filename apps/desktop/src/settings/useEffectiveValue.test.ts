// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useEffectiveValue } from "./useEffectiveValue";
import { useSettingsStore } from "./settingsStore";

/**
 * Exercises the hook through a small React component because its contract
 * includes reactivity, not just value resolution.
 */
function Probe({ settingKey }: { settingKey: string }) {
  const value = useEffectiveValue(settingKey);
  return createElement(
    "span",
    { "data-testid": "effective-value" },
    value === undefined ? "undefined" : String(value)
  );
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  useSettingsStore.setState({
    appValues: {},
    workspaceValues: null,
    stagedChanges: {},
    isDirty: false,
    dirtyCount: 0,
    loaded: false
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

/** Renders the probe and flushes its initial render. */
async function renderProbe(settingKey: string): Promise<void> {
  await act(async () => {
    root?.render(createElement(Probe, { settingKey }));
  });
}

/** Reads the value currently rendered by the probe. */
function renderedValue(): string {
  return container?.querySelector("[data-testid='effective-value']")?.textContent ?? "";
}

describe("useEffectiveValue", () => {
  it("returns the staged value when present", async () => {
    useSettingsStore.setState({
      appValues: { "appearance.theme": "light" },
      stagedChanges: { "appearance.theme": "dark" }
    });

    await renderProbe("appearance.theme");

    expect(renderedValue()).toBe("dark");
  });

  it("falls back to appValues when no staged value is present", async () => {
    useSettingsStore.setState({
      appValues: { "appearance.theme": "light" }
    });

    await renderProbe("appearance.theme");

    expect(renderedValue()).toBe("light");
  });

  it("falls back to workspaceValues for workspace-scoped settings", async () => {
    useSettingsStore.setState({
      appValues: { "sync.destination": "app-value" },
      workspaceValues: { "sync.destination": "workspace-value" }
    });

    await renderProbe("sync.destination");

    expect(renderedValue()).toBe("workspace-value");
  });

  it("falls back to the registry default when no stored value is present", async () => {
    await renderProbe("appearance.theme");

    expect(renderedValue()).toBe("system");
  });

  it("updates when the staged value changes", async () => {
    useSettingsStore.setState({
      appValues: { "appearance.theme": "light" }
    });
    await renderProbe("appearance.theme");
    expect(renderedValue()).toBe("light");

    await act(async () => {
      useSettingsStore.getState().stageChange("appearance.theme", "dark");
    });

    expect(renderedValue()).toBe("dark");
  });
});
