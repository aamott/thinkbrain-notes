// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDesktopPanelRegistry,
  type DesktopPanelContext
} from "../panels/panelRegistry";
import { createDesktopExtensionHost } from "./desktopExtensionHost";

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

    const action = panels.get("calendar.month")?.actions?.[0];
    expect(action?.label).toBe("Go to today");
    action?.run();
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
