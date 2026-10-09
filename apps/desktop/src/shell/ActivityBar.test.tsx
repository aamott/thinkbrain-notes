// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { desktopPanelRegistry } from "../panels/panelRegistryModel";
import { ActivityBar } from "./ActivityBar";

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

const activityBar = (
  isPanelAvailable: (panelId: string) => boolean = () => true
): React.ReactElement => (
  <ActivityBar
    leftPanel={null}
    onSelectLeftPanel={() => undefined}
    onOpenSettings={() => undefined}
    isPanelAvailable={isPanelAvailable}
  />
);

describe("ActivityBar", () => {
  it("renders the registered left panels", async () => {
    const host = await render(activityBar());

    expect(host.querySelector('[aria-label="Files"]')).not.toBeNull();
  });

  /**
   * A locally loaded extension registers its contributions while the app is
   * already running, so the activity bar must follow the registry rather than
   * read it once during the first render.
   */
  it("shows a panel registered after the first render", async () => {
    const host = await render(activityBar());
    expect(host.querySelector('[aria-label="Late Panel"]')).toBeNull();

    const registration = desktopPanelRegistry.register({
      id: "late-panel",
      label: "Late Panel",
      icon: "★",
      side: "left",
      factory: () => null
    });

    try {
      await act(async () => undefined);
      expect(host.querySelector('[aria-label="Late Panel"]')).not.toBeNull();
    } finally {
      registration.dispose();
    }
  });

  /**
   * `LeftPanelContribution.availability` is consulted here — the registry's
   * own `tags` panel declares `() => false` — but only as a visual hint:
   * left contributions render their own `Unavailable` placeholder, so the
   * icon stays clickable and opening it explains why it is unavailable.
   */
  it("dims an unavailable panel's icon but keeps it clickable", async () => {
    const onSelect = vi.fn();
    const host = await render(
      <ActivityBar
        leftPanel={null}
        onSelectLeftPanel={onSelect}
        onOpenSettings={() => undefined}
        isPanelAvailable={(id) => id !== "tags"}
      />
    );

    const tags = host.querySelector<HTMLButtonElement>('button[aria-label="Tags"]');
    expect(tags).not.toBeNull();
    expect(tags!.className).toContain("opacity-40");
    // Clicking still selects the panel — its body renders the explanation.
    tags!.click();
    expect(onSelect).toHaveBeenCalledWith("tags");
    // Available neighbours stay ordinary buttons.
    expect(host.querySelector('button[aria-label="Files"]')?.className).not.toContain("opacity-40");
  });

  it("drops a panel whose registration is disposed", async () => {
    const registration = desktopPanelRegistry.register({
      id: "temporary-panel",
      label: "Temporary Panel",
      icon: "◆",
      side: "left",
      factory: () => null
    });
    const host = await render(activityBar());
    expect(host.querySelector('[aria-label="Temporary Panel"]')).not.toBeNull();

    registration.dispose();
    await act(async () => undefined);

    expect(host.querySelector('[aria-label="Temporary Panel"]')).toBeNull();
  });
});
