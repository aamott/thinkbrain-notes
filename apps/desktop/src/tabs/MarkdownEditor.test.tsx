// @vitest-environment happy-dom

import { act, useEffect, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  desktopEditorHeaderRegistry,
  type EditorHeaderContext
} from "./editorHeaderRegistry.ts";
import { EditorView } from "@codemirror/view";
import { undo } from "@codemirror/commands";

import { MarkdownEditor } from "./MarkdownEditor";
import { releaseEditorState, releaseEditorStatesExcept } from "./editorStateCache";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const mount = async (element: React.ReactElement): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(element);
  });
  return container;
};

describe("MarkdownEditor live preview", () => {
  it("renders markdown formatted when live preview is enabled", async () => {
    // The cursor defaults to offset 0, which is not on the heading line, so
    // the heading must render without its `##`.
    const host = await mount(
      <MarkdownEditor value={"body\n\n## hi"} onChange={() => {}} onSave={() => {}} />
    );
    const lines = host.querySelectorAll(".cm-line");
    expect(lines[2]?.textContent).toBe("hi");
    expect(lines[2]?.className).toContain("cm-h2");
  });

  it("shows raw source when live preview is disabled", async () => {
    const host = await mount(
      <MarkdownEditor
        value={"body\n\n## hi"}
        livePreview={false}
        onChange={() => {}}
        onSave={() => {}}
      />
    );
    const lines = host.querySelectorAll(".cm-line");
    expect(lines[2]?.textContent).toBe("## hi");
    expect(lines[2]?.className).not.toContain("cm-h2");
  });

  it("swaps modes in place without losing the document", async () => {
    const host = await mount(
      <MarkdownEditor value={"body\n\n## hi"} onChange={() => {}} onSave={() => {}} />
    );
    expect(host.querySelectorAll(".cm-line")[2]?.textContent).toBe("hi");

    await act(async () => {
      root?.render(
        <MarkdownEditor
          value={"body\n\n## hi"}
          livePreview={false}
          onChange={() => {}}
          onSave={() => {}}
        />
      );
    });

    expect(host.querySelectorAll(".cm-line")[2]?.textContent).toBe("## hi");
  });
});

describe("MarkdownEditor", () => {
  it("creates, updates, and destroys its controlled CodeMirror view", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const onChange = vi.fn<(value: string) => void>();
    const onSave = vi.fn<() => void>();

    await act(async () => {
      root?.render(
        <MarkdownEditor value="# Initial" onChange={onChange} onSave={onSave} />
      );
    });

    const content = container.querySelector<HTMLElement>(".cm-content");
    expect(content).not.toBeNull();
    expect(content?.getAttribute("aria-label")).toBe("Markdown editor");
    expect(content?.textContent).toContain("# Initial");

    await act(async () => {
      root?.render(
        <MarkdownEditor value="# Updated" onChange={onChange} onSave={onSave} />
      );
    });

    expect(content?.textContent).toContain("# Updated");
    container.querySelector<HTMLButtonElement>("button")?.click();
    expect(onSave).toHaveBeenCalledOnce();

    await act(async () => root?.unmount());
    expect(container.querySelector(".cm-editor")).toBeNull();
    root = null;
  });
});

describe("MarkdownEditor header slot", () => {
  const header = (id: string) => ({
    id,
    label: "Entry metadata",
    render: ({ relativePath }: EditorHeaderContext) => <p>header for {relativePath}</p>
  });

  it("renders a contributed header above the editor body", async () => {
    const handle = desktopEditorHeaderRegistry.register(header("above-body"));
    try {
      const host = await mount(
        <MarkdownEditor
          value="body"
          relativePath="journal/2026/08/2026-08-07-1802.md"
          onChange={() => {}}
          onSave={() => {}}
        />
      );

      const region = host.querySelector('[data-editor-header="above-body"]');
      expect(region?.textContent).toBe("header for journal/2026/08/2026-08-07-1802.md");
      // Above the text, not inside CodeMirror's DOM.
      expect(region?.compareDocumentPosition(host.querySelector(".cm-editor")!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
    } finally {
      handle.dispose();
    }
  });

  it("shows a header registered after the editor mounted, without rebuilding it", async () => {
    // A lazily activated extension must reach editors that are already open,
    // and doing so must not cost the user their cursor or undo history.
    const host = await mount(
      <MarkdownEditor value="body" relativePath="note.md" onChange={() => {}} onSave={() => {}} />
    );
    const editorBefore = host.querySelector(".cm-editor");

    const handle = desktopEditorHeaderRegistry.register(header("late"));
    try {
      await act(async () => {});

      expect(host.querySelector('[data-editor-header="late"]')).not.toBeNull();
      expect(host.querySelector(".cm-editor")).toBe(editorBefore);
    } finally {
      handle.dispose();
    }
  });

  it("removes a disposed header without disturbing the document", async () => {
    const host = await mount(
      <MarkdownEditor value="body" relativePath="note.md" onChange={() => {}} onSave={() => {}} />
    );
    const handle = desktopEditorHeaderRegistry.register(header("temporary"));
    await act(async () => {});
    const editorBefore = host.querySelector(".cm-editor");

    await act(async () => handle.dispose());

    expect(host.querySelector('[data-editor-header="temporary"]')).toBeNull();
    expect(host.querySelector(".cm-editor")).toBe(editorBefore);
    expect(host.querySelector(".cm-content")?.textContent).toContain("body");
  });
});

/** Reads the live editor's cursor offset out of the rendered view. */
const cursorOf = (host: HTMLElement): number => {
  const editor = host.querySelector(".cm-editor");
  const view = editor === null ? null : EditorView.findFromDOM(editor as HTMLElement);
  if (!view) throw new Error("No editor mounted.");
  return view.state.selection.main.head;
};

describe("where the cursor starts", () => {
  /**
   * The reported bug: a journal entry opened with its frontmatter showing,
   * because a new document's selection sits at position 0 — inside the block —
   * and live preview reads that as "the cursor is in here, reveal it".
   */
  it("starts after the frontmatter, not inside it", async () => {
    const host = await mount(
      <MarkdownEditor
        value={"---\ndate: 2026-08-08\nmood: happy\n---\n\nBread needed more salt.\n"}
        onChange={() => {}}
        onSave={() => {}}
      />
    );

    expect(cursorOf(host)).toBe(37);
  });

  it("starts at the top of a note that has no frontmatter", async () => {
    const host = await mount(
      <MarkdownEditor value={"# Heading\n\nBread.\n"} onChange={() => {}} onSave={() => {}} />
    );

    expect(cursorOf(host)).toBe(0);
  });
});

describe("an edit that arrives as a whole new document", () => {
  /**
   * The metadata widget hands back the entire note with one frontmatter key
   * changed. Replacing the document wholesale moved the cursor to the end and
   * made the edit one undo step away from everything else the user had typed.
   */
  const NOTE = "---\ndate: 2026-08-08\n---\n\nBread needed more salt.\n";
  const EDITED = "---\ndate: 2026-08-08\nmood: good\n---\n\nBread needed more salt.\n";

  it("keeps the cursor where the user left it", async () => {
    const host = await mount(
      <MarkdownEditor value={NOTE} onChange={() => {}} onSave={() => {}} />
    );
    const view = EditorView.findFromDOM(host.querySelector(".cm-editor") as HTMLElement);
    const inBody = NOTE.indexOf("needed");
    await act(async () => {
      view?.dispatch({ selection: { anchor: inBody } });
    });

    await act(async () => {
      root?.render(<MarkdownEditor value={EDITED} onChange={() => {}} onSave={() => {}} />);
    });

    // The same character, pushed along by what was inserted above it.
    expect(cursorOf(host)).toBe(inBody + (EDITED.length - NOTE.length));
  });

  it("applies the edit", async () => {
    const host = await mount(
      <MarkdownEditor value={NOTE} onChange={() => {}} onSave={() => {}} />
    );

    await act(async () => {
      root?.render(<MarkdownEditor value={EDITED} onChange={() => {}} onSave={() => {}} />);
    });

    const view = EditorView.findFromDOM(host.querySelector(".cm-editor") as HTMLElement);
    expect(view?.state.doc.toString()).toBe(EDITED);
  });

  it("touches nothing when the value has not moved", async () => {
    const host = await mount(
      <MarkdownEditor value={NOTE} onChange={() => {}} onSave={() => {}} />
    );
    const view = EditorView.findFromDOM(host.querySelector(".cm-editor") as HTMLElement);
    const before = view?.state.doc.toString();

    await act(async () => {
      root?.render(<MarkdownEditor value={NOTE} onChange={() => {}} onSave={() => {}} />);
    });

    expect(view?.state.doc.toString()).toBe(before);
  });
});

describe("switching tabs away and back", () => {
  /**
   * The shell keys the editor on the tab id, so switching tabs unmounts
   * CodeMirror and mounts a fresh one. The document survives because the shell
   * holds it, but everything the editor itself knows — where the cursor was,
   * what could still be undone — was thrown away on every switch.
   */
  const NOTE = "# Heading\n\nBread needed more salt.\n";

  const viewOf = (host: HTMLElement): EditorView => {
    const editor = host.querySelector(".cm-editor");
    const view = editor === null ? null : EditorView.findFromDOM(editor as HTMLElement);
    if (!view) throw new Error("No editor mounted.");
    return view;
  };

  /** Unmounts and remounts, the way a switch to another tab and back does. */
  const switchAwayAndBack = async (element: React.ReactElement): Promise<HTMLDivElement> => {
    await act(async () => root?.unmount());
    container?.remove();
    return await mount(element);
  };

  it("puts the cursor back where it was left", async () => {
    const host = await mount(
      <MarkdownEditor value={NOTE} stateKey="tab-a" onChange={() => {}} onSave={() => {}} />
    );
    const inBody = NOTE.indexOf("needed");
    await act(async () => {
      viewOf(host).dispatch({ selection: { anchor: inBody } });
    });

    const next = await switchAwayAndBack(
      <MarkdownEditor value={NOTE} stateKey="tab-a" onChange={() => {}} onSave={() => {}} />
    );

    expect(cursorOf(next)).toBe(inBody);
  });

  it("can still undo what was typed before the switch", async () => {
    const host = await mount(
      <MarkdownEditor value={NOTE} stateKey="tab-a" onChange={() => {}} onSave={() => {}} />
    );
    await act(async () => {
      viewOf(host).dispatch({ changes: { from: 0, to: 0, insert: "typed " } });
    });
    const typed = viewOf(host).state.doc.toString();

    const next = await switchAwayAndBack(
      <MarkdownEditor value={typed} stateKey="tab-a" onChange={() => {}} onSave={() => {}} />
    );
    await act(async () => {
      undo(viewOf(next));
    });

    expect(viewOf(next).state.doc.toString()).toBe(NOTE);
  });

  it("does not hand one tab's cursor to another tab", async () => {
    const host = await mount(
      <MarkdownEditor value={NOTE} stateKey="tab-a" onChange={() => {}} onSave={() => {}} />
    );
    await act(async () => {
      viewOf(host).dispatch({ selection: { anchor: NOTE.indexOf("needed") } });
    });

    const other = await switchAwayAndBack(
      <MarkdownEditor value={NOTE} stateKey="tab-b" onChange={() => {}} onSave={() => {}} />
    );

    expect(cursorOf(other)).toBe(0);
  });

  /**
   * A closed tab is gone: reopening the same note starts it fresh rather than
   * restoring a cursor from a session the user ended.
   */
  it("forgets a tab that was closed", async () => {
    const host = await mount(
      <MarkdownEditor value={NOTE} stateKey="tab-a" onChange={() => {}} onSave={() => {}} />
    );
    await act(async () => {
      viewOf(host).dispatch({ selection: { anchor: NOTE.indexOf("needed") } });
    });

    await act(async () => root?.unmount());
    container?.remove();
    releaseEditorState("tab-a");
    const reopened = await mount(
      <MarkdownEditor value={NOTE} stateKey="tab-a" onChange={() => {}} onSave={() => {}} />
    );

    expect(cursorOf(reopened)).toBe(0);
  });

  /**
   * The parked state carries the previous mount's extensions, and those close
   * over the previous mount's callbacks. Restored without rebinding, the editor
   * keeps reporting to a component React has already thrown away.
   */
  it("reports edits to the mount that is on screen now", async () => {
    const before = vi.fn();
    const after = vi.fn();
    await mount(
      <MarkdownEditor value={NOTE} stateKey="tab-a" onChange={before} onSave={() => {}} />
    );

    const next = await switchAwayAndBack(
      <MarkdownEditor value={NOTE} stateKey="tab-a" onChange={after} onSave={() => {}} />
    );
    await act(async () => {
      viewOf(next).dispatch({ changes: { from: 0, to: 0, insert: "x" } });
    });

    expect(after).toHaveBeenCalled();
    expect(before).not.toHaveBeenCalled();
  });

  /**
   * Closing a tab looks exactly like switching away from it, so the editor
   * parks its state either way and the shell sweeps up afterwards. This pins
   * the order the two happen in: park on unmount, then sweep. Reversed, the
   * parked state outlives the tab and a reopened note inherits a cursor from a
   * session the user ended.
   */
  it("is swept away when the shell drops the tab", async () => {
    function Shell({ open }: { readonly open: readonly string[] }) {
      const ids = useMemo(() => new Set(open), [open]);
      useEffect(() => {
        releaseEditorStatesExcept(ids);
      }, [ids]);
      return open.includes("tab-a") ? (
        <MarkdownEditor value={NOTE} stateKey="tab-a" onChange={() => {}} onSave={() => {}} />
      ) : null;
    }

    const host = await mount(<Shell open={["tab-a"]} />);
    await act(async () => {
      viewOf(host).dispatch({ selection: { anchor: NOTE.indexOf("needed") } });
    });

    await act(async () => root?.render(<Shell open={[]} />));
    await act(async () => root?.render(<Shell open={["tab-a"]} />));

    expect(cursorOf(host)).toBe(0);
  });

  it("keeps no state for an editor with no tab to key it on", async () => {
    const host = await mount(
      <MarkdownEditor value={NOTE} onChange={() => {}} onSave={() => {}} />
    );
    await act(async () => {
      viewOf(host).dispatch({ selection: { anchor: NOTE.indexOf("needed") } });
    });

    const next = await switchAwayAndBack(
      <MarkdownEditor value={NOTE} onChange={() => {}} onSave={() => {}} />
    );

    expect(cursorOf(next)).toBe(0);
  });
});
