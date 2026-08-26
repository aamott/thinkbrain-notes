// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { desktopPanelRegistry } from "../../panels/panelRegistryModel";
import { InspectorSheet } from "./InspectorSheet";

// The registry is a module singleton, so an extension panel registered here is
// live for every test in this file. Registering once (rather than per test)
// keeps the registry's loud duplicate rejection happy.
const extensionPanel = desktopPanelRegistry.register({
  id: "hello-notes.inspector",
  label: "Hello inspector",
  icon: "outline",
  side: "right",
  factory: () => <p>hello</p>
});

afterAll(() => extensionPanel.dispose());

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
};

const sheet = (overrides: Record<string, unknown> = {}): React.ReactElement => (
  <InspectorSheet
    open
    panel="outline"
    rootPath={null}
    documentContents={null}
    onDismiss={() => undefined}
    onSelectPanel={() => undefined}
    {...overrides}
  />
);

/**
 * Scoped to the segmented control on purpose: the panel body below it mounts
 * real inspectors, and an unscoped `[aria-label="Assistant"]` would happily
 * match something the assistant surface rendered instead of the tab.
 */
const tabs = (host: HTMLDivElement): Element | null =>
  host.querySelector('[role="tablist"][aria-label="Inspectors"]');

describe("InspectorSheet", () => {
  it("offers every registered right panel", async () => {
    const host = await render(sheet());

    const control = tabs(host);
    expect(control?.querySelector('[aria-label="Outline"]')).not.toBeNull();
    expect(control?.querySelector('[aria-label="Properties"]')).not.toBeNull();
    expect(control?.querySelector('[aria-label="Backlinks"]')).not.toBeNull();
    expect(control?.querySelector('[aria-label="Assistant"]')).not.toBeNull();
  });

  // The segmented control reads the live registry rather than a phone-specific
  // list, so a right panel an extension registers is reachable with no mobile
  // work. Without this the sheet could hardcode the four built-ins and pass
  // every other test in this file.
  it("offers right panels registered by an extension", async () => {
    const host = await render(sheet());

    expect(tabs(host)?.querySelector('[aria-label="Hello inspector"]')).not.toBeNull();
  });

  it("marks the selected panel", async () => {
    const host = await render(sheet({ panel: "properties" }));

    expect(
      tabs(host)?.querySelector('[aria-label="Properties"]')?.getAttribute("aria-selected")
    ).toBe("true");
    expect(
      tabs(host)?.querySelector('[aria-label="Outline"]')?.getAttribute("aria-selected")
    ).toBe("false");
  });

  it("switches panels without dismissing the sheet", async () => {
    const onSelectPanel = vi.fn();
    const onDismiss = vi.fn();
    const host = await render(sheet({ onSelectPanel, onDismiss }));

    await act(async () => {
      tabs(host)?.querySelector<HTMLButtonElement>('[aria-label="Properties"]')?.click();
    });

    expect(onSelectPanel).toHaveBeenCalledWith("properties");
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("renders the selected inspector's body", async () => {
    const host = await render(sheet({ panel: "outline", documentContents: "# Heading one" }));

    expect(host.querySelector('[aria-label="Outline panel"]')?.textContent).toContain(
      "Heading one"
    );
  });

  it("renders nothing while closed", async () => {
    const host = await render(sheet({ open: false }));

    expect(host.querySelector('[aria-label="Document tools"]')).toBeNull();
  });
});
