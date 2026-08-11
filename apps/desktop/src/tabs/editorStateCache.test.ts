import { EditorState } from "@codemirror/state";
import { beforeEach, describe, expect, it } from "vitest";

import {
  recallEditorState,
  releaseEditorState,
  releaseEditorStatesExcept,
  rememberEditorState
} from "./editorStateCache";

const park = (key: string, doc: string): void => {
  rememberEditorState(key, { state: EditorState.create({ doc }), scrollTop: 0 });
};

const parkedDoc = (key: string): string | undefined =>
  recallEditorState(key)?.state.doc.toString();

beforeEach(() => {
  releaseEditorStatesExcept(new Set());
});

describe("what the editor parks between tab switches", () => {
  it("hands back what was parked under a key", () => {
    park("tab-a", "alpha");
    park("tab-b", "beta");

    expect(parkedDoc("tab-a")).toBe("alpha");
    expect(parkedDoc("tab-b")).toBe("beta");
  });

  it("knows nothing about a key never parked", () => {
    expect(recallEditorState("tab-a")).toBeUndefined();
  });

  it("forgets one key on release", () => {
    park("tab-a", "alpha");
    park("tab-b", "beta");

    releaseEditorState("tab-a");

    expect(recallEditorState("tab-a")).toBeUndefined();
    expect(parkedDoc("tab-b")).toBe("beta");
  });

  /** Tabs close without telling the editor, so the shell sweeps by what is open. */
  it("forgets every key outside the set of open tabs", () => {
    park("tab-a", "alpha");
    park("tab-b", "beta");
    park("tab-c", "gamma");

    releaseEditorStatesExcept(new Set(["tab-b"]));

    expect(recallEditorState("tab-a")).toBeUndefined();
    expect(parkedDoc("tab-b")).toBe("beta");
    expect(recallEditorState("tab-c")).toBeUndefined();
  });

  /**
   * The cap is a backstop against a leak, not a policy. It drops the tab parked
   * longest ago, and re-parking a key counts as using it.
   */
  it("drops the least recently parked once it is full", () => {
    for (let index = 0; index < 24; index += 1) park(`tab-${index}`, `doc-${index}`);
    // Touch the oldest, so the next eviction should take the second oldest.
    park("tab-0", "doc-0");

    park("tab-24", "doc-24");

    expect(parkedDoc("tab-0")).toBe("doc-0");
    expect(recallEditorState("tab-1")).toBeUndefined();
    expect(parkedDoc("tab-24")).toBe("doc-24");
  });
});
