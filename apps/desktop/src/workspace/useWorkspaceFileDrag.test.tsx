// @vitest-environment happy-dom

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeWorkspaceEntry } from "../native/commands";
import {
  useWorkspaceFileDrag,
  WORKSPACE_TREE_DRAG_TYPE,
  type WorkspaceFileDrag
} from "./useWorkspaceFileDrag";

const entry = (relativePath: string, kind: NativeWorkspaceEntry["kind"] = "file"): NativeWorkspaceEntry => ({
  relative_path: relativePath,
  name: relativePath.split("/").at(-1) ?? relativePath,
  parent_path: relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : "",
  kind,
  is_markdown: relativePath.endsWith(".md"),
  byte_size: 0,
  updated_at: null
});

interface FakeDragEvent {
  dataTransfer: {
    setData: ReturnType<typeof vi.fn>;
    getData: ReturnType<typeof vi.fn>;
    effectAllowed: string;
    dropEffect: string;
  };
  clientY: number;
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
}

function dragEvent(clientY = 0): FakeDragEvent {
  const data = new Map<string, string>();
  return {
    dataTransfer: {
      setData: vi.fn((type: string, value: string) => data.set(type, value)),
      getData: vi.fn((type: string) => data.get(type) ?? ""),
      effectAllowed: "",
      dropEffect: ""
    },
    clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latestDrag: WorkspaceFileDrag | null = null;
const expanded = new Set<string>();
const expandFolder = vi.fn((path: string) => expanded.add(path));
const moveEntry = vi.fn(async () => true);

function mount(rootPath: string | null = "/vault") {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const Harness = () => {
    const containerRef = useRef<HTMLUListElement | null>(null);
    const drag = useWorkspaceFileDrag({
      rootPath,
      isExpanded: (path) => expanded.has(path),
      expandFolder,
      moveEntry,
      containerRef
    });
    latestDrag = drag;
    return <ul ref={containerRef} />;
  };
  act(() => {
    root!.render(<Harness />);
  });
}

beforeEach(() => {
  latestDrag = null;
  expanded.clear();
  expandFolder.mockClear();
  moveEntry.mockClear();
  mount();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
});

describe("useWorkspaceFileDrag", () => {
  it("writes internal + OS payloads on dragstart", () => {
    const event = dragEvent();
    act(() => {
      latestDrag!.onRowDragStart(event as never, entry("docs/note.md"));
    });
    expect(event.dataTransfer.setData).toHaveBeenCalledWith(WORKSPACE_TREE_DRAG_TYPE, "docs/note.md");
    expect(event.dataTransfer.setData).toHaveBeenCalledWith(
      "text/uri-list",
      "file:///vault/docs/note.md"
    );
    expect(event.dataTransfer.setData).toHaveBeenCalledWith(
      "DownloadURL",
      "application/octet-stream:note.md:file:///vault/docs/note.md"
    );
    expect(event.dataTransfer.effectAllowed).toBe("copyMove");
    expect(latestDrag!.draggedPath).toBe("docs/note.md");
  });

  it("percent-encodes uri-list paths and skips DownloadURL for folders", () => {
    const event = dragEvent();
    act(() => {
      latestDrag!.onRowDragStart(event as never, entry("my docs", "directory"));
    });
    expect(event.dataTransfer.setData).toHaveBeenCalledWith(
      "text/uri-list",
      "file:///vault/my%20docs"
    );
    expect(event.dataTransfer.setData).not.toHaveBeenCalledWith("DownloadURL", expect.anything());
  });

  it("drops onto a folder move the entry", async () => {
    act(() => {
      latestDrag!.onRowDragStart(dragEvent() as never, entry("note.md"));
    });
    const over = dragEvent();
    act(() => {
      latestDrag!.onRowDragOver(over as never, entry("docs", "directory"));
    });
    expect(over.preventDefault).toHaveBeenCalled();
    expect(over.dataTransfer.dropEffect).toBe("move");
    expect(latestDrag!.dropTargetPath).toBe("docs");
    expect(latestDrag!.dropTargetValid).toBe(true);

    await act(async () => {
      latestDrag!.onRowDrop(dragEvent() as never, entry("docs", "directory"));
      await Promise.resolve();
    });
    expect(moveEntry).toHaveBeenCalledWith(
      expect.objectContaining({ relative_path: "note.md" }),
      "docs"
    );
    expect(latestDrag!.draggedPath).toBeNull();
  });

  it("refuses invalid drops — same parent, self, descendants", () => {
    act(() => {
      latestDrag!.onRowDragStart(dragEvent() as never, entry("docs/a", "directory"));
    });
    // Its own parent is a no-op: not droppable.
    const sameParent = dragEvent();
    act(() => {
      latestDrag!.onRowDragOver(sameParent as never, entry("docs", "directory"));
    });
    expect(latestDrag!.dropTargetValid).toBe(false);
    expect(sameParent.preventDefault).not.toHaveBeenCalled();

    // Into its own subtree is illegal.
    const subtree = dragEvent();
    act(() => {
      latestDrag!.onRowDragOver(subtree as never, entry("docs/a/b", "directory"));
    });
    expect(subtree.dataTransfer.dropEffect).toBe("none");
    expect(subtree.preventDefault).not.toHaveBeenCalled();
  });

  it("file rows are dead ends that never fall back to the root", () => {
    act(() => {
      latestDrag!.onRowDragStart(dragEvent() as never, entry("note.md"));
    });
    const over = dragEvent();
    act(() => {
      latestDrag!.onRowDragOver(over as never, entry("other.md"));
    });
    expect(over.stopPropagation).toHaveBeenCalled();
    expect(latestDrag!.dropTargetPath).toBeNull();
    expect(over.dataTransfer.dropEffect).toBe("none");
  });

  it("external drags (no marker) cannot drop inside the tree", () => {
    // No dragstart — draggedEntryRef stays null, as it would for an OS file
    // dragged over the window.
    const over = dragEvent();
    act(() => {
      latestDrag!.onRowDragOver(over as never, entry("docs", "directory"));
    });
    expect(over.preventDefault).not.toHaveBeenCalled();
    expect(latestDrag!.dropTargetPath).toBeNull();
  });

  it("dragend clears all state", () => {
    act(() => {
      latestDrag!.onRowDragStart(dragEvent() as never, entry("note.md"));
    });
    act(() => {
      latestDrag!.onDragEnd(dragEvent() as never);
    });
    expect(latestDrag!.draggedPath).toBeNull();
    expect(latestDrag!.dropTargetPath).toBeNull();
  });
});
