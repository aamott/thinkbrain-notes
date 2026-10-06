// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PanelTitle } from "./PanelTitle";
import type { PanelAction } from "./panelRegistryModel";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

const render = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
};

const click = async (button: Element | null): Promise<void> => {
  await act(async () => {
    (button as HTMLButtonElement).click();
  });
};

const action = (overrides: Partial<PanelAction> = {}): PanelAction => ({
  id: "refresh",
  label: "Refresh",
  icon: "↻",
  run: () => undefined,
  ...overrides
});

describe("PanelTitle", () => {
  it("shows the panel title", async () => {
    const host = await render(<PanelTitle title="Explorer" />);

    expect(host.querySelector("h2")?.textContent).toBe("Explorer");
  });

  it("renders a button for each declared action, named for accessibility", async () => {
    const host = await render(
      <PanelTitle
        title="Journal"
        actions={[action({ id: "today", label: "Go to today", icon: "◎" }), action()]}
      />
    );

    expect(host.querySelector('[aria-label="Go to today"]')?.textContent).toBe("◎");
    expect(host.querySelector('[aria-label="Refresh"]')).not.toBeNull();
  });

  it("runs an action when its button is clicked", async () => {
    const run = vi.fn();
    const host = await render(<PanelTitle title="Journal" actions={[action({ run })]} />);

    await click(host.querySelector('[aria-label="Refresh"]'));

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("keeps the header working when an action throws", async () => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const second = vi.fn();
    const host = await render(
      <PanelTitle
        title="Journal"
        actions={[
          action({
            id: "broken",
            label: "Broken",
            run: () => {
              throw new Error("boom");
            }
          }),
          action({ id: "fine", label: "Fine", run: second })
        ]}
      />
    );

    await click(host.querySelector('[aria-label="Broken"]'));
    await click(host.querySelector('[aria-label="Fine"]'));

    expect(second).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalled();
  });

  it("reports an action that rejects", async () => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const host = await render(
      <PanelTitle
        title="Journal"
        actions={[action({ run: () => Promise.reject(new Error("late boom")) })]}
      />
    );

    await click(host.querySelector('[aria-label="Refresh"]'));

    expect(reported).toHaveBeenCalled();
  });

  it("renders a leading Back control when onBack is supplied", async () => {
    const onBack = vi.fn();
    const host = await render(<PanelTitle title="Outline" onBack={onBack} />);

    const back = host.querySelector('[aria-label="Back from Outline"]');
    expect(back).not.toBeNull();

    await click(back);

    expect(onBack).toHaveBeenCalledTimes(1);
    // The title survives alongside the new control.
    expect(host.querySelector("h2")?.textContent).toBe("Outline");
  });

  it("renders no Back control when onBack is absent", async () => {
    const host = await render(<PanelTitle title="Outline" />);

    expect(host.querySelector('[aria-label="Back from Outline"]')).toBeNull();
  });

  it("renders a menu action as a dropdown with checkbox and button items", async () => {
    const onSettings = vi.fn();
    const onToggle = vi.fn();
    const host = await render(
      <PanelTitle
        title="Sync conflicts"
        actions={[
          {
            id: "options",
            label: "Conflict options",
            icon: "more-horizontal",
            menu: [
              { label: "Show hidden files", checked: true, run: onToggle },
              { label: "Sync settings", icon: "settings", run: onSettings, separatorBefore: true },
              { label: "Sign in with GitHub", disabled: true, note: "Soon" }
            ]
          }
        ]}
      />
    );

    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Conflict options"]');
    expect(trigger?.getAttribute("aria-haspopup")).toBe("menu");
    await click(trigger);

    const checkbox = host.querySelector('[role="menuitemcheckbox"]');
    expect(checkbox?.getAttribute("aria-checked")).toBe("true");
    // Toggling keeps the menu open so the flipped state is visible.
    await click(checkbox);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="menu"]')).not.toBeNull();

    const disabled = host.querySelector('[role="menuitem"][aria-disabled="true"]');
    expect(disabled?.textContent).toContain("Sign in with GitHub");

    const settings = Array.from(host.querySelectorAll('[role="menuitem"]'))
      .find((item) => item.textContent?.includes("Sync settings"));
    await click(settings ?? null);
    expect(onSettings).toHaveBeenCalledTimes(1);
    // A plain item closes the menu before running.
    expect(host.querySelector('[role="menu"]')).toBeNull();
  });

  it("lets a node replace the eyebrow label via titleContent", async () => {
    const host = await render(
      <PanelTitle title="Files" titleContent={<button type="button">notes ▾</button>} />
    );

    expect(host.querySelector("h2")).toBeNull();
    expect(host.textContent).toContain("notes ▾");
  });
});
