// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConflictComparison } from "./conflictTypes";

const readConflict = vi.fn<() => Promise<ConflictComparison>>();
const resolveConflict = vi.fn<() => Promise<unknown>>();

vi.mock("./conflictService", () => ({
  readConflict: () => readConflict(),
  resolveConflict: (...args: unknown[]) => resolveConflict(...(args as []))
}));

// The side-by-side surface is CodeMirror's, not this screen's behavior: what
// the tests owe is that it is mounted with the right texts and that edits to
// its result reach "Save merged note". A stub stands in and records the props.
const lastDiff = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));

vi.mock("./CodeMirrorDiff", () => ({
  CodeMirrorDiff: (props: Record<string, unknown>) => {
    lastDiff.props = props;
    return (
      <section aria-label={props.ariaLabel as string} data-testid="codemirror-diff">
        <p>{props.beforeLabel as string}</p>
        <p>{props.afterLabel as string}</p>
        <pre data-testid="before">{props.before as string}</pre>
        <pre data-testid="after">{props.after as string}</pre>
      </section>
    );
  }
}));

const { MergeTab } = await import("./MergeTab");

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const COMPARISON: ConflictComparison = {
  kind: "text",
  ours: {
    path: "Meeting Notes.md",
    label: "This computer",
    byteSize: 40,
    changedAt: null,
    fingerprint: "ours"
  },
  theirs: {
    path: "Meeting Notes.sync-conflict-20260816-093100-K3SDFHG.md",
    label: "OneDrive",
    byteSize: 44,
    changedAt: null,
    fingerprint: "theirs"
  },
  chunks: [
    { kind: "common", text: "# Q3 sync\nattendees\n" },
    { kind: "choice", ours: "follow up with design\n", theirs: "sync directly with design\n" },
    { kind: "common", text: "next check-in Aug 18\n" }
  ]
};

const OURS_TEXT = "# Q3 sync\nattendees\nfollow up with design\nnext check-in Aug 18\n";
const THEIRS_TEXT = "# Q3 sync\nattendees\nsync directly with design\nnext check-in Aug 18\n";

beforeEach(() => {
  lastDiff.props = null;
  readConflict.mockReset().mockResolvedValue(COMPARISON);
  resolveConflict.mockReset().mockResolvedValue({ note: "Meeting Notes.md", keptAs: null, checkpoint: "a" });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(<MergeTab rootPath="/notes" copyPath={COMPARISON.theirs.path} buffer={null} />)
  );
  return container;
};

const button = (host: HTMLElement, text: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(text)
  );
  if (!found) throw new Error(`No button reading "${text}" among: ${host.textContent}`);
  return found;
};

describe("comparing two versions", () => {
  it("opens with both sides named the way the user knows them", async () => {
    const host = await render();

    expect(host.textContent).toContain("Two versions of this note exist");
    expect(host.textContent).toContain("This computer");
    expect(host.textContent).toContain("OneDrive");
  });

  // CodeMirror aligns the two versions; this surface owes it both complete
  // documents, rebuilt exactly from the comparison the native side sent.
  it("hands the comparison both whole versions, incoming on the left", async () => {
    const host = await render();

    expect(host.querySelector('[data-testid="codemirror-diff"]')).not.toBeNull();
    expect(lastDiff.props?.before).toBe(THEIRS_TEXT);
    expect(lastDiff.props?.after).toBe(OURS_TEXT);
    expect(lastDiff.props?.beforeLabel).toBe("OneDrive");
    expect(lastDiff.props?.afterLabel).toContain("This computer");
    expect(lastDiff.props?.relativePath).toBe("Meeting Notes.md");
    expect(lastDiff.props?.editableAfter).toBe(true);
    expect(lastDiff.props?.transferBeforeToAfter).toBe(true);
  });

  it("explains how to work the comparison", async () => {
    const host = await render();

    expect(host.textContent).toContain("arrows between the panes");
    expect(host.textContent).toContain("edit the result");
  });
});

describe("choosing what to keep", () => {
  it("offers the whole-file choices and the merged save", async () => {
    const host = await render();

    expect(() => button(host, "Keep current")).not.toThrow();
    expect(() => button(host, "Use incoming")).not.toThrow();
    expect(() => button(host, "Keep both files")).not.toThrow();
    expect(() => button(host, "Save merged note")).not.toThrow();
  });

  it("keeps this computer's version", async () => {
    const host = await render();

    await act(async () => button(host, "Keep current").click());

    expect(resolveConflict).toHaveBeenCalledWith("/notes", COMPARISON, { kind: "keepOurs" });
  });

  it("takes the incoming version", async () => {
    const host = await render();

    await act(async () => button(host, "Use incoming").click());

    expect(resolveConflict).toHaveBeenCalledWith("/notes", COMPARISON, { kind: "keepTheirs" });
  });

  it("keeps both versions as separate files", async () => {
    const host = await render();

    await act(async () => button(host, "Keep both files").click());

    expect(resolveConflict).toHaveBeenCalledWith("/notes", COMPARISON, { kind: "keepBoth" });
  });

  // The promise the screen is built on: the right pane's text is the note.
  it("saves this computer's version when the result was left untouched", async () => {
    const host = await render();

    await act(async () => button(host, "Save merged note").click());

    expect(resolveConflict).toHaveBeenCalledWith("/notes", COMPARISON, {
      kind: "merged",
      contents: OURS_TEXT
    });
  });

  it("saves the edited result, whatever made the edit", async () => {
    const host = await render();
    const edited = "# Q3 sync\nattendees\nmerged by hand\nnext check-in Aug 18\n";
    await act(async () => {
      (lastDiff.props?.onAfterChange as (contents: string) => void)(edited);
    });

    await act(async () => button(host, "Save merged note").click());

    expect(resolveConflict).toHaveBeenCalledWith("/notes", COMPARISON, {
      kind: "merged",
      contents: edited
    });
  });
});

describe("while a decision is being written", () => {
  it("disables every action so nothing races the write", async () => {
    let settle: (value: unknown) => void = () => undefined;
    resolveConflict.mockReturnValue(new Promise((resolve) => { settle = resolve; }));
    const host = await render();

    await act(async () => button(host, "Keep current").click());

    for (const label of ["Keep current", "Use incoming", "Keep both files", "Save merged note"]) {
      expect(button(host, label).disabled).toBe(true);
    }

    await act(async () => settle({ note: "Meeting Notes.md", keptAs: null, checkpoint: "a" }));
  });

  it("says what happened, and that it can be undone", async () => {
    const host = await render();

    await act(async () => button(host, "Keep current").click());

    expect(host.textContent).toContain("Saved");
    expect(host.textContent).toContain("Version history");
  });

  /// The native side refuses a write whose versions have moved. That refusal is
  /// the user's cue that someone else got there first, so it has to be visible.
  it("shows a refusal rather than pretending the note was saved", async () => {
    resolveConflict.mockRejectedValue(new Error("One of these versions changed."));
    const host = await render();

    await act(async () => button(host, "Keep current").click());

    expect(host.textContent).toContain("Could not compare these versions");
    expect(host.textContent).not.toContain("Saved");
  });
});

describe("a file that cannot be compared piece by piece", () => {
  it("keeps the whole-file choices but mounts no comparison", async () => {
    readConflict.mockResolvedValue({ ...COMPARISON, kind: "binary", chunks: [] });

    const host = await render();

    expect(host.textContent).toContain("can't be compared");
    expect(host.querySelector('[data-testid="codemirror-diff"]')).toBeNull();
    expect(lastDiff.props).toBeNull();
    expect(() => button(host, "Keep current")).not.toThrow();
    expect(() => button(host, "Use incoming")).not.toThrow();
    expect(() => button(host, "Keep both files")).not.toThrow();
    expect(host.querySelectorAll("button")).toHaveLength(3);
  });
});
