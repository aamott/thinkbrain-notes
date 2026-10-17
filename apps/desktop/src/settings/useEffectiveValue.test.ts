// @vitest-environment happy-dom

import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useEffectiveValue } from "./useEffectiveValue";
import { useSettingsStore } from "./settingsStore";
import { createSettingsTestHarness } from "./settingsTestHelpers";

/**
 * Exercises the hook through a small React component because its contract
 * includes reactivity, not just value resolution. The pure precedence table
 * itself is pinned in `settingsStore.test.ts` under `resolveEffectiveValue`;
 * this suite only proves the hook re-renders as each store layer changes.
 */
function Probe({ settingKey }: { settingKey: string }) {
  const value = useEffectiveValue(settingKey);
  return createElement(
    "span",
    { "data-testid": "effective-value" },
    value === undefined ? "undefined" : String(value)
  );
}

const harness = createSettingsTestHarness();
let container: HTMLDivElement | null = null;

beforeEach(() => {
  useSettingsStore.setState({
    appValues: {},
    workspaceValues: null,
    stagedChanges: {},
    loaded: false
  });
});

afterEach(async () => {
  await harness.unmount();
  container = null;
});

/** Reads the value currently rendered by the probe. */
function renderedValue(): string {
  return container?.querySelector("[data-testid='effective-value']")?.textContent ?? "";
}

describe("useEffectiveValue", () => {
  it("re-renders as each layer changes, including staged fallback and falsy", async () => {
    // A loaded app value shows on mount.
    useSettingsStore.setState({ appValues: { "appearance.theme": "light" } });
    container = await harness.render(createElement(Probe, { settingKey: "appearance.theme" }));
    expect(renderedValue()).toBe("light");

    // With nothing staged, a loaded app update re-renders immediately — this
    // is what pins the appValues subscription rather than any later fallback.
    await act(async () => {
      useSettingsStore.setState({ appValues: { "appearance.theme": "dark" } });
    });
    expect(renderedValue()).toBe("dark");

    // A staged value masks the loaded layer.
    await act(async () => {
      useSettingsStore.getState().stageChange("appearance.theme", "system");
    });
    expect(renderedValue()).toBe("system");

    // A loaded app change underneath a staged value stays hidden until the
    // staged layer resets, and the hook then falls back to the newer value.
    await act(async () => {
      useSettingsStore.setState({ appValues: { "appearance.theme": "light" } });
    });
    expect(renderedValue()).toBe("system");
    await act(async () => {
      useSettingsStore.getState().resetStaged();
    });
    expect(renderedValue()).toBe("light");

    // Workspace values drive workspace-scoped keys reactively too — and a
    // falsy workspace value must surface, not fall through to the default.
    await act(async () => {
      useSettingsStore.setState({ workspaceValues: { "sync.destination": "nas" } });
    });
    container = await harness.render(createElement(Probe, { settingKey: "sync.destination" }));
    expect(renderedValue()).toBe("nas");

    await act(async () => {
      useSettingsStore.setState({ workspaceValues: { "sync.destination": "" } });
    });
    expect(renderedValue()).toBe("");
  });
});
