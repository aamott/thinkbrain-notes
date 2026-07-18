// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSelector } from "./WorkspaceExplorer";
import { WorkspaceFileIcon } from "./WorkspaceFileIcon";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function renderSelector() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const onSelect = vi.fn();
  const onAdd = vi.fn();

  await act(async () => {
    root?.render(
      <WorkspaceSelector
        currentPath="/notes/current"
        paths={["/notes/previous", "/notes/current"]}
        onSelect={onSelect}
        onAdd={onAdd}
      />
    );
  });

  return { onAdd, onSelect };
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

describe("WorkspaceExplorer presentation", () => {
  it("maps common workspace file types to distinct Lucide icons", () => {
    const markup = ["note.md", "settings.json", "photo.png", "archive.zip", "unknown.bin"].map(iconMarkup);

    expect(markup[0]).toContain("lucide-file-text");
    expect(markup[4]).toContain("lucide-file");
    expect(new Set(markup).size).toBe(5);
  });

  it("uses a menu-shaped workspace selector that opens a new workspace without changing its source", async () => {
    const { onAdd, onSelect } = await renderSelector();
    const trigger = container?.querySelector<HTMLButtonElement>("button");
    if (!trigger) throw new Error("Workspace selector trigger was not rendered.");

    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await click(trigger);

    const menu = container?.querySelector("[role='menu']");
    expect(menu?.getAttribute("aria-label")).toBe("Workspaces");
    expect(menu?.querySelectorAll("[role='menuitem']")).toHaveLength(3);
    const previous = Array.from(menu?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes("previous"));
    if (!previous) throw new Error("Known workspace was not rendered.");
    await click(previous);

    expect(onSelect).toHaveBeenCalledWith("/notes/previous");
    expect(container?.querySelector("[role='menu']")).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("closes the selector menu with Escape and exposes Add workspace as its final action", async () => {
    const { onAdd } = await renderSelector();
    const trigger = container?.querySelector<HTMLButtonElement>("button");
    if (!trigger) throw new Error("Workspace selector trigger was not rendered.");
    await click(trigger);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(container?.querySelector("[role='menu']")).toBeNull();

    await click(trigger);
    const actions = Array.from(container?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);
    expect(actions.at(-1)?.textContent).toContain("Add workspace");
    await click(actions.at(-1)!);

    expect(onAdd).toHaveBeenCalledOnce();
    expect(container?.querySelector("[role='menu']")).toBeNull();
  });
});

function iconMarkup(name: string) {
  return renderToStaticMarkup(<WorkspaceFileIcon name={name} />);
}
