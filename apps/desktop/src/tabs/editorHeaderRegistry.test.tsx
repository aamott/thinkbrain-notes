// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDesktopEditorHeaderRegistry,
  type DesktopEditorHeaderContribution,
  type EditorHeaderContext
} from "./editorHeaderRegistry.ts";
import { EditorHeaderSlot } from "./editorHeaderRegistry.tsx";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const context = (overrides: Partial<EditorHeaderContext> = {}): EditorHeaderContext => ({
  rootPath: "/vault",
  relativePath: "journal/2026/08/2026-08-07-1802.md",
  contents: "# Entry",
  ...overrides
});

const header = (
  overrides: Partial<DesktopEditorHeaderContribution> = {}
): DesktopEditorHeaderContribution => ({
  id: "dateline",
  label: "Entry metadata",
  render: () => <p>Friday, August 7, 2026</p>,
  ...overrides
});

const mount = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
};

describe("desktop editor header registry", () => {
  it("lists contributions in registration order", () => {
    const registry = createDesktopEditorHeaderRegistry();
    registry.register(header({ id: "first" }));
    registry.register(header({ id: "second" }));

    expect(registry.entries().map((entry) => entry.id)).toEqual(["first", "second"]);
  });

  it("rejects a duplicate id loudly", () => {
    const registry = createDesktopEditorHeaderRegistry();
    registry.register(header());

    expect(() => registry.register(header())).toThrow(/already registered/i);
  });

  it("removes a contribution when its handle is disposed", () => {
    const registry = createDesktopEditorHeaderRegistry();
    const handle = registry.register(header());

    handle.dispose();

    expect(registry.entries()).toEqual([]);
  });

  it("notifies subscribers on registration and disposal", () => {
    const registry = createDesktopEditorHeaderRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);

    const handle = registry.register(header());
    handle.dispose();

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("EditorHeaderSlot", () => {
  it("renders a contribution inside its own labelled region", async () => {
    const registry = createDesktopEditorHeaderRegistry([header()]);

    const host = await mount(<EditorHeaderSlot context={context()} registry={registry} />);

    const region = host.querySelector('[aria-label="Entry metadata"]');
    expect(region?.textContent).toBe("Friday, August 7, 2026");
  });

  it("renders nothing at all when no contribution applies", async () => {
    // An empty slot must not leave a bordered strip above the document.
    const registry = createDesktopEditorHeaderRegistry([
      header({ applies: () => false })
    ]);

    const host = await mount(<EditorHeaderSlot context={context()} registry={registry} />);

    expect(host.innerHTML).toBe("");
  });

  it("asks each contribution whether it applies to this document", async () => {
    const registry = createDesktopEditorHeaderRegistry([
      header({
        id: "journal",
        label: "Journal",
        applies: ({ relativePath }) => relativePath?.startsWith("journal/") ?? false
      })
    ]);

    const host = await mount(
      <EditorHeaderSlot context={context({ relativePath: "README.md" })} registry={registry} />
    );

    expect(host.textContent).toBe("");
  });

  it("passes the document context through to the contribution", async () => {
    const render = vi.fn(() => <p>rendered</p>);
    const registry = createDesktopEditorHeaderRegistry([header({ render })]);
    const given = context();

    await mount(<EditorHeaderSlot context={given} registry={registry} />);

    expect(render).toHaveBeenCalledWith(given);
  });

  it("shows a contribution registered after it mounted", async () => {
    // The whole point of the registry: a lazily activated extension must reach
    // editors that are already open.
    const registry = createDesktopEditorHeaderRegistry();
    const host = await mount(<EditorHeaderSlot context={context()} registry={registry} />);

    await act(async () => {
      registry.register(header());
    });

    expect(host.textContent).toBe("Friday, August 7, 2026");
  });

  it("drops a contribution as soon as it is disposed", async () => {
    const registry = createDesktopEditorHeaderRegistry();
    const host = await mount(<EditorHeaderSlot context={context()} registry={registry} />);
    let handle: { dispose: () => void } | null = null;
    await act(async () => {
      handle = registry.register(header());
    });

    await act(async () => handle?.dispose());

    expect(host.innerHTML).toBe("");
  });

  it("renders several contributions in registration order", async () => {
    const registry = createDesktopEditorHeaderRegistry([
      header({ id: "one", label: "One", render: () => <p>one</p> }),
      header({ id: "two", label: "Two", render: () => <p>two</p> })
    ]);

    const host = await mount(<EditorHeaderSlot context={context()} registry={registry} />);

    expect(host.textContent).toBe("onetwo");
  });
});
