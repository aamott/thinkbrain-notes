// @vitest-environment happy-dom

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeWorkspaceEntry } from "../native/commands";
import {
  useWorkspaceTreeDrag,
  WORKSPACE_DROP_PARENT_ATTR,
  WORKSPACE_DROP_ROOT_ATTR,
  WORKSPACE_TREE_ROW_ATTR,
  type WorkspaceTreeDrag
} from "./useWorkspaceTreeDrag";

const file = (relativePath: string): NativeWorkspaceEntry => ({
  relative_path: relativePath,
  name: relativePath.split("/").at(-1) ?? relativePath,
  parent_path: relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : "",
  kind: "file",
  is_markdown: relativePath.endsWith(".md"),
  byte_size: 0,
  updated_at: null
});

const folder = (relativePath: string): NativeWorkspaceEntry => ({
  ...file(relativePath),
  kind: "directory",
  is_markdown: false
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latestDrag: WorkspaceTreeDrag | null = null;
const openedPaths: string[] = [];
const expandedPaths = new Set<string>();
const expandFolder = vi.fn((path: string) => expandedPaths.add(path));
const moveEntry = vi.fn(async () => true);

function pointerEvent(type: string, init: Record<string, unknown> = {}): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId: 7,
    button: 0,
    clientX: 0,
    clientY: 0,
    pointerType: "mouse",
    ...init
  });
  return event;
}

function rowOf(path: string): HTMLElement {
  const row = container?.querySelector<HTMLElement>(`[${WORKSPACE_TREE_ROW_ATTR}="${path}"]`);
  if (!row) throw new Error(`row ${path} not found`);
  return row;
}

function mainButtonOf(path: string): HTMLElement {
  const button = rowOf(path).querySelector<HTMLElement>("button");
  if (!button) throw new Error(`row ${path} main button not found`);
  return button;
}

function handleOf(path: string): HTMLElement {
  const handle = rowOf(path).querySelector<HTMLElement>(`[aria-label^="Move "]`);
  if (!handle) throw new Error(`row ${path} drag handle not found`);
  return handle;
}

function liveText(): string {
  return container?.querySelector("[data-live]")?.textContent ?? "";
}

function render() {
  const entries = [folder("Folder"), file("Folder/inner.md"), file("a.md"), folder("Target")];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const Harness = () => {
    const containerRef = useRef<HTMLUListElement | null>(null);
    const drag = useWorkspaceTreeDrag({
      folderPaths: ["Folder", "Target"],
      isExpanded: (path) => expandedPaths.has(path),
      expandFolder,
      moveEntry,
      containerRef
    });
    latestDrag = drag;
    return (
      <ul ref={containerRef} {...{ [WORKSPACE_DROP_ROOT_ATTR]: "" }}>
        <p data-live>{drag.announcement}</p>
        {entries.map((item) => (
          <li key={item.relative_path}>
            <div
              {...{ [WORKSPACE_TREE_ROW_ATTR]: item.relative_path }}
              {...(item.kind === "directory" ? { [WORKSPACE_DROP_PARENT_ATTR]: item.relative_path } : {})}
            >
              <button
                type="button"
                aria-label={`Open ${item.name}`}
                onPointerDown={(event) => drag.onRowPointerDown(event, item)}
                onClick={() => {
                  if (drag.consumeSuppressedClick()) return;
                  openedPaths.push(item.relative_path);
                }}
              >
                {item.name}
              </button>
              <button
                type="button"
                aria-label={`Move ${item.name}. Press Enter to pick it up.`}
                onPointerDown={(event) => drag.onHandlePointerDown(event, item)}
                onKeyDown={(event) => drag.onHandleKeyDown(event, item)}
              />
            </div>
          </li>
        ))}
      </ul>
    );
  };
  return act(async () => {
    root?.render(<Harness />);
  });
}

beforeEach(() => {
  openedPaths.length = 0;
  expandedPaths.clear();
  expandFolder.mockClear();
  moveEntry.mockClear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  latestDrag = null;
  document.body.style.userSelect = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("pointer drags", () => {
  it("does not start a drag before the movement threshold", async () => {
    await render();
    const row = mainButtonOf("a.md");
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointerdown"));
      row.dispatchEvent(pointerEvent("pointermove", { clientX: 2, clientY: 2 }));
      row.dispatchEvent(pointerEvent("pointerup", { clientX: 2, clientY: 2 }));
    });
    expect(moveEntry).not.toHaveBeenCalled();
    expect(latestDrag?.draggedPath).toBeNull();
    expect(document.body.style.userSelect).toBe("");
  });

  it("drops onto a folder target after crossing the threshold", async () => {
    const target = rowOf.bind(null, "Target");
    await render();
    const targetRow = target();
    vi.spyOn(document, "elementFromPoint").mockReturnValue(targetRow);
    const row = mainButtonOf("a.md");
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointerdown"));
      row.dispatchEvent(pointerEvent("pointermove", { clientX: 10, clientY: 0 }));
    });
    expect(latestDrag?.draggedPath).toBe("a.md");
    expect(latestDrag?.dropTargetPath).toBe("Target");
    expect(latestDrag?.dropTargetValid).toBe(true);
    expect(document.body.style.userSelect).toBe("none");
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 0 }));
    });
    expect(moveEntry).toHaveBeenCalledWith(file("a.md"), "Target");
    expect(liveText()).toContain("Moved a.md to Target/a.md");
    expect(latestDrag?.draggedPath).toBeNull();
    expect(document.body.style.userSelect).toBe("");
  });

  it("drops onto the workspace root over root whitespace", async () => {
    await render();
    const list = container!.querySelector("ul")!;
    vi.spyOn(document, "elementFromPoint").mockReturnValue(list);
    const row = mainButtonOf("Folder/inner.md");
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointerdown"));
      row.dispatchEvent(pointerEvent("pointermove", { clientX: 30, clientY: 0 }));
    });
    expect(latestDrag?.dropTargetPath).toBe("");
    expect(latestDrag?.dropTargetValid).toBe(true);
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointerup", { clientX: 30, clientY: 0 }));
    });
    expect(moveEntry).toHaveBeenCalledWith(file("Folder/inner.md"), "");
  });

  it("does not call moveEntry when the drop target is the current parent", async () => {
    await render();
    vi.spyOn(document, "elementFromPoint").mockReturnValue(container!.querySelector("ul")!);
    const row = mainButtonOf("a.md");
    // a.md already lives at the root: dropping on root whitespace is a no-op,
    // so the controller marks the target invalid and no move runs.
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointerdown"));
      row.dispatchEvent(pointerEvent("pointermove", { clientX: 30, clientY: 0 }));
    });
    expect(latestDrag?.dropTargetPath).toBe("");
    expect(latestDrag?.dropTargetValid).toBe(false);
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointerup", { clientX: 30, clientY: 0 }));
    });
    expect(moveEntry).not.toHaveBeenCalled();
  });

  it("blocks the root fallback while hovering a file row", async () => {
    await render();
    const fileRow = rowOf("a.md").querySelector("button")!.firstElementChild ?? rowOf("a.md");
    vi.spyOn(document, "elementFromPoint").mockReturnValue(fileRow as Element);
    const row = mainButtonOf("a.md");
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointerdown"));
      row.dispatchEvent(pointerEvent("pointermove", { clientX: 30, clientY: 0 }));
    });
    expect(latestDrag?.dropTargetPath).toBeNull();
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointerup", { clientX: 30, clientY: 0 }));
    });
    expect(moveEntry).not.toHaveBeenCalled();
  });

  it("cancels on pointercancel and restores document styles", async () => {
    await render();
    const row = mainButtonOf("a.md");
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointerdown"));
      row.dispatchEvent(pointerEvent("pointermove", { clientX: 30, clientY: 0 }));
      row.dispatchEvent(pointerEvent("pointercancel", { clientX: 30, clientY: 0 }));
    });
    expect(latestDrag?.draggedPath).toBeNull();
    expect(document.body.style.userSelect).toBe("");
    expect(moveEntry).not.toHaveBeenCalled();
    expect(liveText()).toContain("cancelled");
  });

  it("restores the body's prior userSelect rather than clearing it", async () => {
    document.body.style.userSelect = "text";
    await render();
    const row = mainButtonOf("a.md");
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointerdown"));
      row.dispatchEvent(pointerEvent("pointermove", { clientX: 30, clientY: 0 }));
    });
    expect(document.body.style.userSelect).toBe("none");
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointercancel", { clientX: 30, clientY: 0 }));
    });
    expect(document.body.style.userSelect).toBe("text");
    document.body.style.userSelect = "";
  });

  it("suppresses the click that follows a completed drag", async () => {
    await render();
    vi.spyOn(document, "elementFromPoint").mockReturnValue(rowOf("Target"));
    const row = mainButtonOf("a.md");
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointerdown"));
      row.dispatchEvent(pointerEvent("pointermove", { clientX: 30, clientY: 0 }));
      row.dispatchEvent(pointerEvent("pointerup", { clientX: 30, clientY: 0 }));
      row.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(openedPaths).toEqual([]);
  });

  it("ignores a touch press on the row but drags from the handle", async () => {
    await render();
    vi.spyOn(document, "elementFromPoint").mockReturnValue(rowOf("Target"));
    const row = mainButtonOf("a.md");
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointerdown", { pointerType: "touch" }));
      row.dispatchEvent(pointerEvent("pointermove", { pointerType: "touch", clientX: 40, clientY: 40 }));
      row.dispatchEvent(pointerEvent("pointerup", { pointerType: "touch", clientX: 40, clientY: 40 }));
    });
    expect(latestDrag?.draggedPath).toBeNull();
    expect(moveEntry).not.toHaveBeenCalled();

    const handle = handleOf("a.md");
    await act(async () => {
      handle.dispatchEvent(pointerEvent("pointerdown", { pointerType: "touch" }));
      handle.dispatchEvent(pointerEvent("pointermove", { pointerType: "touch", clientX: 40, clientY: 0 }));
      handle.dispatchEvent(pointerEvent("pointerup", { pointerType: "touch", clientX: 40, clientY: 0 }));
    });
    expect(moveEntry).toHaveBeenCalledWith(file("a.md"), "Target");
  });

  it("auto-expands a collapsed folder target after the hover delay", async () => {
    vi.useFakeTimers();
    await render();
    vi.spyOn(document, "elementFromPoint").mockReturnValue(rowOf("Target"));
    const row = mainButtonOf("a.md");
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointerdown"));
      row.dispatchEvent(pointerEvent("pointermove", { clientX: 30, clientY: 0 }));
    });
    expect(expandFolder).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(650);
    });
    expect(expandFolder).toHaveBeenCalledWith("Target");
  });

  it("auto-scrolls the tree near its edges", async () => {
    await render();
    const list = container!.querySelector<HTMLElement>("ul")!;
    Object.defineProperty(list, "getBoundingClientRect", {
      value: () => ({ top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) })
    });
    list.scrollTop = 50;
    vi.spyOn(document, "elementFromPoint").mockReturnValue(rowOf("Target"));
    const row = mainButtonOf("a.md");
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointerdown"));
      row.dispatchEvent(pointerEvent("pointermove", { clientX: 30, clientY: 5 }));
    });
    expect(list.scrollTop).toBeLessThan(50);
    list.scrollTop = 10;
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointermove", { clientX: 30, clientY: 98 }));
    });
    expect(list.scrollTop).toBeGreaterThan(10);
    await act(async () => {
      row.dispatchEvent(pointerEvent("pointercancel", { clientX: 30, clientY: 98 }));
    });
  });
});

describe("keyboard moves", () => {
  it("picks up, cycles destinations, and drops with Enter", async () => {
    await render();
    const handle = handleOf("a.md");
    const press = (key: string) =>
      handle.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

    await act(async () => press("Enter"));
    expect(latestDrag?.draggedPath).toBe("a.md");
    // a.md's parent is the root, so the cycle offers the two folders.
    expect(liveText()).toContain("Picked up a.md");
    expect(liveText()).toContain("Destination: Folder");

    await act(async () => press("ArrowDown"));
    expect(liveText()).toContain("Destination: Target");

    // Cycles wrap around.
    await act(async () => press("ArrowDown"));
    expect(liveText()).toContain("Destination: Folder");

    await act(async () => press("Enter"));
    expect(moveEntry).toHaveBeenCalledWith(file("a.md"), "Folder");
    expect(liveText()).toContain("Moved a.md to Folder/a.md");
    expect(latestDrag?.draggedPath).toBeNull();
  });

  it("excludes the source folder and its descendants from destinations", async () => {
    await render();
    const handle = handleOf("Folder");
    // Folder already lives at the root, so the only valid destination is
    // Target — the cycle never offers the folder itself or the root.
    await act(async () =>
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(liveText()).toContain("Picked up Folder");
    expect(liveText()).toContain("Destination: Target");
    await act(async () =>
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })));
    // A single destination wraps straight back to itself.
    expect(liveText()).toContain("Destination: Target");
    await act(async () =>
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  });

  it("cancels a keyboard pickup with Escape and announces it", async () => {
    await render();
    const handle = handleOf("a.md");
    await act(async () =>
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })));
    expect(latestDrag?.draggedPath).toBe("a.md");
    await act(async () =>
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(latestDrag?.draggedPath).toBeNull();
    expect(liveText()).toContain("cancelled");
    expect(moveEntry).not.toHaveBeenCalled();
  });

  it("runs an in-flight drop exactly once when Enter repeats", async () => {
    let resolveMove!: (value: boolean) => void;
    moveEntry.mockReturnValueOnce(new Promise<boolean>((resolve) => { resolveMove = resolve; }));
    await render();
    const handle = handleOf("a.md");
    const press = (key: string) =>
      handle.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

    await act(async () => press("Enter"));
    await act(async () => press("Enter"));
    expect(moveEntry).toHaveBeenCalledOnce();
    // Every key — including Escape — is ignored while the drop is in flight.
    await act(async () => {
      press("Enter");
      press("ArrowDown");
      press("Escape");
    });
    expect(moveEntry).toHaveBeenCalledOnce();
    await act(async () => resolveMove(true));
    expect(liveText()).toContain("Moved a.md");
  });

  it("announces a failed drop", async () => {
    moveEntry.mockResolvedValueOnce(false);
    await render();
    const handle = handleOf("a.md");
    await act(async () =>
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    await act(async () =>
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(liveText()).toContain("Could not move a.md");
    expect(latestDrag?.draggedPath).toBeNull();
  });
});
