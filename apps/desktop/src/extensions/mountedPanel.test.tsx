// @vitest-environment happy-dom
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionManifest } from "@thinkbrain/core";

import { createDesktopCommandRegistry } from "../commands/commandRegistry";
import { createMobileNewNoteActionRegistry } from "../commands/mobileNewNoteActionRegistry";
import {
  createDesktopPanelRegistry,
  type DesktopPanelContext,
  type DesktopPanelRegistry
} from "../panels/panelRegistryModel";
import { Popout } from "../panels/Popout";
import { bootstrapExtensions } from "./bootstrap";
import {
  createDesktopExtensionHost,
  type DesktopExtensionActivation,
  type DesktopExtensionContext
} from "./desktopExtensionHost";

/**
 * A panel contributed with `mount` is the contract an extension loaded from
 * disk uses: it never touches React, and the shell renders it exactly like a
 * built-in's panel.
 */

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const panelContext = (
  overrides: Partial<DesktopPanelContext> = {}
): DesktopPanelContext =>
  ({
    rootPath: "/vault",
    documentContents: null,
    documentPath: null,
    onOpenNote: () => undefined,
    explorerProps: {} as DesktopPanelContext["explorerProps"],
    onOpenSearchResult: () => undefined,
    ...overrides
  }) as DesktopPanelContext;

const renderPanel = async (element: React.ReactNode): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
};

describe("panels contributed with a mount function", () => {
  it("renders the extension's own DOM through the panel registry", async () => {
    const panels = createDesktopPanelRegistry([]);
    const host = createDesktopExtensionHost({ panels });
    host.register({
      id: "calendar",
      trusted: true,
      activate: (context) => {
        context.panels.register({
          id: "month",
          label: "Month",
          icon: "▤",
          side: "left",
          mount: (element, mountContext) => {
            const heading = element.ownerDocument.createElement("h2");
            heading.textContent = `Month for ${mountContext.state.rootPath}`;
            element.append(heading);
          }
        });
      }
    });

    await host.activate("calendar");

    const panel = panels.get("calendar.month");
    expect(panel?.label).toBe("Month");
    expect(panel?.side).toBe("left");

    const host_ = await renderPanel(panel?.factory(panelContext()));
    expect(host_.querySelector("h2")?.textContent).toBe("Month for /vault");
  });

  it("passes host state changes to a mounted panel", async () => {
    const panels = createDesktopPanelRegistry([]);
    const host = createDesktopExtensionHost({ panels });
    host.register({
      id: "stats",
      trusted: true,
      activate: (context) => {
        context.panels.register({
          id: "counter",
          label: "Counter",
          icon: "∑",
          side: "right",
          mount: (element, mountContext) => {
            const render = (contents: string | null): void => {
              element.textContent = String(contents?.length ?? 0);
            };
            render(mountContext.state.documentContents);
            mountContext.onDidChange((state) => render(state.documentContents));
          }
        });
      }
    });

    await host.activate("stats");
    const panel = panels.get("stats.counter");
    expect(panel?.side).toBe("right");

    const rendered = await renderPanel(panel?.factory(panelContext({ documentContents: "abc" })));
    expect(rendered.textContent).toBe("3");

    await act(async () => {
      root?.render(panel?.factory(panelContext({ documentContents: "abcdef" })));
    });
    expect(rendered.textContent).toBe("6");
  });

  it("carries the header actions a mounted panel contributes", async () => {
    const run = vi.fn();
    const panels = createDesktopPanelRegistry([]);
    const host = createDesktopExtensionHost({ panels });
    host.register({
      id: "calendar",
      trusted: true,
      activate: (context) => {
        context.panels.register({
          id: "month",
          label: "Month",
          icon: "▤",
          side: "left",
          mount: () => undefined,
          actions: [{ id: "today", label: "Go to today", icon: "◎", run }]
        });
      }
    });

    await host.activate("calendar");

    const declared = panels.get("calendar.month")?.actions;
    const action = typeof declared === "function" ? undefined : declared?.[0];
    expect(action?.label).toBe("Go to today");
    void action?.run?.();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("removes a mounted panel when its extension deactivates", async () => {
    const panels = createDesktopPanelRegistry([]);
    const host = createDesktopExtensionHost({ panels });
    host.register({
      id: "calendar",
      trusted: true,
      activate: (context) => {
        context.panels.register({
          id: "month",
          label: "Month",
          icon: "▤",
          side: "left",
          mount: () => undefined
        });
      }
    });

    await host.activate("calendar");
    expect(panels.get("calendar.month")).toBeDefined();

    await host.deactivate("calendar");
    expect(panels.get("calendar.month")).toBeUndefined();
  });

  it("rejects a panel that declares neither a factory nor a mount", async () => {
    const panels = createDesktopPanelRegistry([]);
    const host = createDesktopExtensionHost({ panels });
    host.register({
      id: "calendar",
      trusted: true,
      activate: (context) => {
        (context.panels.register as (panel: unknown) => unknown)({
          id: "month",
          label: "Month",
          icon: "▤",
          side: "left"
        });
      }
    });

    const error = await host.activate("calendar").catch((thrown: unknown) => thrown);

    expect((error as { cause?: Error }).cause?.message).toMatch(/factory or a mount/i);
    expect(panels.get("calendar.month")).toBeUndefined();
  });
});

/**
 * The popout over a lazily activating extension panel. The stub must hold the
 * panel id for the whole activation window so the placeholder — "Starting
 * extension…", or the failure message when activation rejects — stays mounted
 * instead of flashing "Panel 'x.y' is not registered".
 */
describe("lazy panel placeholder in the popout", () => {
  const lazyPanelManifest = (): ExtensionManifest => ({
    id: "sample",
    name: "Sample",
    version: "1.0.0",
    apiVersion: "^1.0.0",
    engines: { platform: ["desktop"] },
    activationEvents: ["onView:stats"],
    capabilities: [],
    contributes: {
      commands: [],
      panels: [{ id: "stats", label: "Stats", icon: "∑", side: "right" }]
    }
  });

  // The wide registry context: `entriesBySide` hands the popout contributions
  // typed over `DesktopPanelContext`, so the harness supplies the full shape.
  const popoutContext: DesktopPanelContext = {
    rootPath: "/vault",
    documentContents: null,
    documentPath: null,
    onOpenNote: () => undefined,
    onCompareVersion: () => undefined,
    onRestoreVersion: async () => undefined,
    explorerProps: {} as DesktopPanelContext["explorerProps"],
    onOpenSearchResult: () => undefined,
    onReviewConflict: () => undefined,
    onOpenSyncSettings: () => undefined
  };

  const setupLazyPanel = (activate: DesktopExtensionActivation) => {
    const commands = createDesktopCommandRegistry([]);
    const panels = createDesktopPanelRegistry([]);
    const actions = createMobileNewNoteActionRegistry();
    const host = createDesktopExtensionHost({ commands, panels });
    const boot = bootstrapExtensions({
      host,
      commands,
      panels,
      mobileNewNoteActions: actions,
      extensions: [{ manifest: lazyPanelManifest(), activate }]
    });
    return { panels, boot };
  };

  /** Re-renders the popout whenever the registry changes, like the real hooks. */
  function PopoutHarness({ panels }: { readonly panels: DesktopPanelRegistry }) {
    const [, bump] = useState(0);
    useEffect(() => panels.subscribe(() => bump((version) => version + 1)), [panels]);
    return (
      <Popout
        side="right"
        panel="sample.stats"
        context={popoutContext}
        contributions={panels.entriesBySide("right")}
      />
    );
  }

  const renderPopout = async (panels: DesktopPanelRegistry): Promise<HTMLDivElement> =>
    renderPanel(<PopoutHarness panels={panels} />);

  it("shows 'Starting extension…' through activation, never 'not registered'", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const activate = vi.fn(async (context: DesktopExtensionContext) => {
      await gate;
      context.panels.register({
        id: "stats",
        label: "Stats",
        icon: "∑",
        side: "right",
        factory: () => <span>real stats panel</span>
      });
    });
    const { panels, boot } = setupLazyPanel(activate);

    const rendered = await renderPopout(panels);

    // Mounting the placeholder kicked off activation; while it is pending the
    // stub still owns the id, so the popout renders the placeholder copy.
    expect(activate).toHaveBeenCalledTimes(1);
    expect(rendered.textContent).toContain("Starting extension…");
    expect(rendered.textContent).not.toContain("not registered");

    release();
    await act(async () => undefined);

    expect(rendered.textContent).toContain("real stats panel");
    expect(rendered.textContent).not.toContain("not registered");

    await act(async () => {
      await boot.dispose();
    });
  });

  it("shows the designed failure message when activation rejects", async () => {
    const activate = vi.fn(async () => {
      throw new Error("boom");
    });
    const { panels, boot } = setupLazyPanel(activate);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const rendered = await renderPopout(panels);
      await act(async () => undefined);

      expect(rendered.textContent).toContain("This extension failed to start");
      expect(rendered.textContent).not.toContain("not registered");
    } finally {
      spy.mockRestore();
      await act(async () => {
        await boot.dispose();
      });
    }
  });
});
