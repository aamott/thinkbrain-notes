// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MOBILE_HUB_CONTROL, type SettingDefinition } from "@thinkbrain/core";
import { getControlForDefinition } from "../controlRegistry";
import { MobileHubControl } from "./MobileHubControl";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const definition: SettingDefinition = {
  key: "ui.mobileHub",
  type: "string",
  default: "",
  scope: "app",
  section: "ui.mobile",
  control: MOBILE_HUB_CONTROL,
  label: "Bottom bar shortcuts",
  description: "Shortcuts shown in the bottom bar on phones."
};

const render = async (value: unknown, onChange = vi.fn()): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MobileHubControl definition={definition} value={value} onChange={onChange} />
    );
  });
  return container;
};

describe("MobileHubControl", () => {
  it("is what the registry resolves for the hub setting", () => {
    // Without the registration the registry logs a miss and falls back to a
    // text box holding raw JSON, which invites hand-editing the navigation bar.
    expect(getControlForDefinition(definition)).toBe(MobileHubControl);
  });

  it("names the default shortcuts rather than showing their JSON", async () => {
    const host = await render("");

    const labels = [...host.querySelectorAll("li")].map((item) => item.textContent);
    expect(labels.join(" ")).toContain("Files");
    expect(labels.join(" ")).toContain("Menu");
    expect(host.textContent).not.toContain('"kind"');
  });

  it("reads back a customized hub", async () => {
    const host = await render('[{"kind":"panel","id":"search"},{"kind":"menu"}]');

    const labels = [...host.querySelectorAll("li")].map((item) => item.textContent ?? "");
    expect(labels).toHaveLength(2);
    expect(labels[0]).toContain("Search");
    expect(labels[1]).toContain("Menu");
  });

  it("resets by clearing the value, not by writing the defaults out", async () => {
    // Storing "" keeps the defaults live: a later change to DEFAULT_HUB_ITEMS
    // reaches anyone who never customized, which a materialized copy would not.
    const onChange = vi.fn();
    const host = await render('[{"kind":"panel","id":"search"},{"kind":"menu"}]', onChange);

    await act(async () => {
      host.querySelector<HTMLButtonElement>("button")?.click();
    });

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("offers no reset when the hub is already the default", async () => {
    const host = await render("");

    expect(host.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
  });
});
