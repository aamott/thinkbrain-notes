import { describe, expect, it } from "vitest";

import {
  canGoBackInTabs,
  canGoForwardInTabs,
  createEditorTab,
  createFileTab,
  createNewTab,
  createStaticTab,
  createVersionDiffTab,
  desktopTabReducer,
  initialDesktopTabState,
  isDocumentBackedKind,
  restoreBreadcrumbSegments,
  tabAccessibleName,
  versionDiffTabId
} from "./tabModel";

const welcome = createStaticTab("settings", "Settings");
const firstNote = createEditorTab({ rootPath: "/notes", relativePath: "Ideas/first.md" });
const secondNote = createEditorTab({ rootPath: "/notes", relativePath: "second.md" });

function reduce(...actions: Parameters<typeof desktopTabReducer>[1][]) {
  return actions.reduce(desktopTabReducer, initialDesktopTabState);
}

describe("desktopTabReducer", () => {
  it("opens an editor tab once, selects it, and preserves unsaved changes", () => {
    const opened = reduce(
      { type: "open", tab: firstNote },
      { type: "setDirty", tabId: firstNote.id, isDirty: true },
      { type: "open", tab: firstNote }
    );

    expect(opened.tabs).toHaveLength(1);
    expect(opened.tabs[0]).toMatchObject({ id: firstNote.id, isDirty: true });
    expect(opened.activeTabId).toBe(firstNote.id);
  });

  it("uses the right neighbour, then left neighbour, when closing the active tab", () => {
    const withTabs = reduce(
      { type: "open", tab: welcome },
      { type: "open", tab: firstNote },
      { type: "open", tab: secondNote },
      { type: "activate", tabId: firstNote.id }
    );
    const closeMiddle = desktopTabReducer(withTabs, { type: "requestClose", tabId: firstNote.id });
    const closeLast = desktopTabReducer(closeMiddle, { type: "requestClose", tabId: secondNote.id });

    expect(closeMiddle.activeTabId).toBe(secondNote.id);
    expect(closeLast.activeTabId).toBe(welcome.id);
  });

  it("does not change the active tab while closing an inactive tab", () => {
    const state = reduce(
      { type: "open", tab: welcome },
      { type: "open", tab: firstNote },
      { type: "activate", tabId: firstNote.id },
      { type: "requestClose", tabId: welcome.id }
    );

    expect(state.activeTabId).toBe(firstNote.id);
    expect(state.tabs.map((tab) => tab.id)).toEqual([firstNote.id]);
  });

  it("holds a dirty tab until discard or a completed save, and permits cancellation", () => {
    const dirty = reduce(
      { type: "open", tab: firstNote },
      { type: "setDirty", tabId: firstNote.id, isDirty: true },
      { type: "requestClose", tabId: firstNote.id }
    );
    const cancelled = desktopTabReducer(dirty, { type: "cancelClose", tabId: firstNote.id });
    const discarded = desktopTabReducer(dirty, { type: "discardClose", tabId: firstNote.id });
    const saved = desktopTabReducer(dirty, { type: "completeSaveAndClose", tabId: firstNote.id });

    expect(dirty.closeRequest).toEqual({ tabId: firstNote.id });
    expect(cancelled.tabs).toHaveLength(1);
    expect(cancelled.closeRequest).toBeNull();
    expect(discarded).toEqual(initialDesktopTabState);
    expect(saved).toEqual(initialDesktopTabState);
  });

  /**
   * A tab's identity is the path of the file it shows, so a file renamed
   * anywhere — the explorer, another editor, a `git checkout` — leaves the tab
   * pointing at somewhere nothing lives. Saving it there writes the file back
   * under its old name.
   */
  it("moves a tab to follow the file it is showing", () => {
    const state = reduce(
      { type: "open", tab: welcome },
      { type: "open", tab: firstNote },
      { type: "setDirty", tabId: firstNote.id, isDirty: true },
      {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "Ideas/first.md" },
        to: { rootPath: "/notes", relativePath: "Ideas/renamed.md" }
      }
    );

    const moved = createEditorTab({ rootPath: "/notes", relativePath: "Ideas/renamed.md" });
    expect(state.tabs.map((tab) => tab.id)).toEqual([welcome.id, moved.id]);
    expect(state.tabs[1]).toMatchObject({
      id: moved.id,
      title: "renamed.md",
      resource: { rootPath: "/notes", relativePath: "Ideas/renamed.md" },
      isDirty: true
    });
  });

  /**
   * Non-Markdown files open as `file:` tabs whose kind is inferred from the
   * extension (text editor, image viewer, …). A move must carry the whole
   * file-tab identity — not just the editor-tab scheme — and keep the tab's
   * unsaved edits with it.
   */
  it("moves a non-Markdown file tab, preserving its kind and dirty edits", () => {
    const textFile = createFileTab({ rootPath: "/notes", relativePath: "data.txt" });
    const state = reduce(
      { type: "open", tab: textFile },
      { type: "setDirty", tabId: textFile.id, isDirty: true },
      {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "data.txt" },
        to: { rootPath: "/notes", relativePath: "docs/data.txt" }
      }
    );

    const moved = createFileTab({ rootPath: "/notes", relativePath: "docs/data.txt" });
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toMatchObject({
      id: moved.id,
      kind: moved.kind,
      resource: { rootPath: "/notes", relativePath: "docs/data.txt" },
      isDirty: true
    });
    expect(state.activeTabId).toBe(moved.id);
  });

  it("converts an editor tab to a file tab when a rename loses the .md extension", () => {
    const state = reduce(
      { type: "open", tab: firstNote },
      { type: "setDirty", tabId: firstNote.id, isDirty: true },
      {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "Ideas/first.md" },
        to: { rootPath: "/notes", relativePath: "Ideas/first.txt" }
      }
    );

    const moved = createFileTab({ rootPath: "/notes", relativePath: "Ideas/first.txt" });
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toMatchObject({
      id: moved.id,
      kind: moved.kind,
      resource: { rootPath: "/notes", relativePath: "Ideas/first.txt" },
      isDirty: true
    });
    expect(state.tabs[0]?.id.startsWith("file:")).toBe(true);
    expect(state.activeTabId).toBe(moved.id);
  });

  it("converts a file tab to an editor tab when a rename gains the .md extension", () => {
    const textFile = createFileTab({ rootPath: "/notes", relativePath: "note.txt" });
    const state = reduce(
      { type: "open", tab: textFile },
      { type: "setDirty", tabId: textFile.id, isDirty: true },
      {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "note.txt" },
        to: { rootPath: "/notes", relativePath: "note.md" }
      }
    );

    const moved = createEditorTab({ rootPath: "/notes", relativePath: "note.md" });
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toMatchObject({
      id: moved.id,
      kind: "editor",
      resource: { rootPath: "/notes", relativePath: "note.md" },
      isDirty: true
    });
    expect(state.activeTabId).toBe(moved.id);
  });

  it("keeps a moved tab selected", () => {
    const state = reduce(
      { type: "open", tab: firstNote },
      {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "Ideas/first.md" },
        to: { rootPath: "/notes", relativePath: "moved.md" }
      }
    );

    expect(state.activeTabId).toBe(
      createEditorTab({ rootPath: "/notes", relativePath: "moved.md" }).id
    );
  });

  it("leaves the other tabs selected when a background tab moves", () => {
    const state = reduce(
      { type: "open", tab: firstNote },
      { type: "open", tab: secondNote },
      {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "Ideas/first.md" },
        to: { rootPath: "/notes", relativePath: "moved.md" }
      }
    );

    expect(state.activeTabId).toBe(secondNote.id);
  });

  it("ignores a move of a file no tab is showing", () => {
    const state = reduce({ type: "open", tab: firstNote });

    expect(
      desktopTabReducer(state, {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "untouched.md" },
        to: { rootPath: "/notes", relativePath: "elsewhere.md" }
      })
    ).toBe(state);
  });

  it("ignores a move within a workspace this window is not showing", () => {
    const state = reduce({ type: "open", tab: firstNote });

    expect(
      desktopTabReducer(state, {
        type: "retarget",
        from: { rootPath: "/other", relativePath: "Ideas/first.md" },
        to: { rootPath: "/other", relativePath: "moved.md" }
      })
    ).toBe(state);
  });

  /**
   * Renaming one open note over another leaves a single file, so it has to
   * leave a single tab — otherwise two tabs share an id and the shell keys its
   * document state by that id.
   */
  it("replaces the tab already sitting at the destination", () => {
    const state = reduce(
      { type: "open", tab: firstNote },
      { type: "open", tab: secondNote },
      {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "Ideas/first.md" },
        to: { rootPath: "/notes", relativePath: "second.md" }
      }
    );

    expect(state.tabs.map((tab) => tab.id)).toEqual([secondNote.id]);
    expect(state.activeTabId).toBe(secondNote.id);
  });

  it("carries a pending close decision over to the moved tab", () => {
    const state = reduce(
      { type: "open", tab: firstNote },
      { type: "setDirty", tabId: firstNote.id, isDirty: true },
      { type: "requestClose", tabId: firstNote.id },
      {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "Ideas/first.md" },
        to: { rootPath: "/notes", relativePath: "moved.md" }
      }
    );

    const moved = createEditorTab({ rootPath: "/notes", relativePath: "moved.md" });
    expect(state.closeRequest).toEqual({ tabId: moved.id });
  });

  it("returns the existing state for unknown tab actions", () => {
    const state = reduce({ type: "open", tab: firstNote });

    expect(desktopTabReducer(state, { type: "activate", tabId: "missing" })).toBe(state);
    expect(desktopTabReducer(state, { type: "requestClose", tabId: "missing" })).toBe(state);
  });
});

describe("tab activation history", () => {
  const noteA = createEditorTab({ rootPath: "/notes", relativePath: "a.md" });
  const noteB = createEditorTab({ rootPath: "/notes", relativePath: "b.md" });
  const noteC = createEditorTab({ rootPath: "/notes", relativePath: "c.md" });

  it("starts with nowhere to go, then records each activation in order", () => {
    expect(canGoBackInTabs(initialDesktopTabState)).toBe(false);
    expect(canGoForwardInTabs(initialDesktopTabState)).toBe(false);

    const state = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB },
      { type: "activate", tabId: noteA.id }
    );

    expect(state.history.entries).toEqual([noteA.id, noteB.id, noteA.id]);
    expect(state.history.cursor).toBe(2);
    expect(canGoBackInTabs(state)).toBe(true);
    expect(canGoForwardInTabs(state)).toBe(false);
  });

  it("re-activating the current tab adds no visit", () => {
    const state = reduce(
      { type: "open", tab: noteA },
      { type: "activate", tabId: noteA.id },
      { type: "activate", tabId: noteA.id }
    );

    expect(state.history.entries).toEqual([noteA.id]);
    expect(canGoBackInTabs(state)).toBe(false);
  });

  it("walks Back over earlier visits and Forward back up again", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB },
      { type: "open", tab: noteC }
    );

    const back1 = desktopTabReducer(opened, { type: "goBack" });
    expect(back1.activeTabId).toBe(noteB.id);
    expect(canGoForwardInTabs(back1)).toBe(true);

    const back2 = desktopTabReducer(back1, { type: "goBack" });
    expect(back2.activeTabId).toBe(noteA.id);
    expect(canGoBackInTabs(back2)).toBe(false);
    // At the bottom of the stack Back is a no-op — same object, no churn.
    expect(desktopTabReducer(back2, { type: "goBack" })).toBe(back2);

    const forward = desktopTabReducer(back2, { type: "goForward" });
    expect(forward.activeTabId).toBe(noteB.id);
    const forward2 = desktopTabReducer(forward, { type: "goForward" });
    expect(forward2.activeTabId).toBe(noteC.id);
    expect(canGoForwardInTabs(forward2)).toBe(false);
    expect(desktopTabReducer(forward2, { type: "goForward" })).toBe(forward2);
  });

  it("truncates the forward tail when a new activation follows a Back", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB },
      { type: "goBack" },
      { type: "open", tab: noteC }
    );

    // noteB's forward visit is gone; Forward stays disabled on the new tip.
    expect(opened.history.entries).toEqual([noteA.id, noteC.id]);
    expect(opened.activeTabId).toBe(noteC.id);
    expect(canGoForwardInTabs(opened)).toBe(false);

    const back = desktopTabReducer(opened, { type: "goBack" });
    expect(back.activeTabId).toBe(noteA.id);
  });

  it("re-raising an already-open tab records a fresh visit", () => {
    const state = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB },
      { type: "open", tab: noteA }
    );

    expect(state.activeTabId).toBe(noteA.id);
    expect(state.history.entries).toEqual([noteA.id, noteB.id, noteA.id]);
  });

  it("scrubs a closed tab's visits and keeps Back on live tabs", () => {
    // Visit A → B → C → B, then close B: both of B's visits die with it.
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB },
      { type: "open", tab: noteC },
      { type: "activate", tabId: noteB.id }
    );
    const closed = desktopTabReducer(opened, { type: "requestClose", tabId: noteB.id });

    expect(closed.history.entries).toEqual([noteA.id, noteC.id]);
    expect(closed.activeTabId).toBe(noteC.id);

    const back = desktopTabReducer(closed, { type: "goBack" });
    expect(back.activeTabId).toBe(noteA.id);
    expect(canGoBackInTabs(back)).toBe(false);
    // Forward must never resurrect the closed tab.
    const forward = desktopTabReducer(back, { type: "goForward" });
    expect(forward.activeTabId).toBe(noteC.id);
    expect(canGoForwardInTabs(forward)).toBe(false);
  });

  it("anchors the cursor on the survivor when the active tab closes", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB },
      { type: "open", tab: noteC }
    );
    const closed = desktopTabReducer(opened, { type: "requestClose", tabId: noteC.id });

    expect(closed.activeTabId).toBe(noteB.id);
    expect(closed.history.entries).toEqual([noteA.id, noteB.id]);
    expect(closed.history.cursor).toBe(1);
    expect(canGoForwardInTabs(closed)).toBe(false);

    const back = desktopTabReducer(closed, { type: "goBack" });
    expect(back.activeTabId).toBe(noteA.id);
  });

  it("follows a retargeted tab so Back lands on the file's new name", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB },
      { type: "activate", tabId: noteA.id },
      {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "b.md" },
        to: { rootPath: "/notes", relativePath: "renamed.md" }
      }
    );
    const moved = createEditorTab({ rootPath: "/notes", relativePath: "renamed.md" });

    const back = desktopTabReducer(opened, { type: "goBack" });
    expect(back.activeTabId).toBe(moved.id);
  });

  it("rebases on resetHistory, keeping only the active tab", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB },
      { type: "resetHistory" }
    );

    expect(opened.history.entries).toEqual([noteB.id]);
    expect(opened.history.cursor).toBe(0);
    expect(canGoBackInTabs(opened)).toBe(false);
    // Already reset: no churn, and an empty shell stays empty.
    expect(desktopTabReducer(opened, { type: "resetHistory" })).toBe(opened);
    expect(desktopTabReducer(initialDesktopTabState, { type: "resetHistory" }))
      .toBe(initialDesktopTabState);
  });
});

describe("tab reuse placements", () => {
  it("opens a file as a preview tab that the next preview open replaces in place", () => {
    const state = reduce(
      { type: "open", tab: firstNote, placement: "preview" },
      { type: "open", tab: secondNote, placement: "preview" }
    );

    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toMatchObject({ id: secondNote.id, preview: true });
    expect(state.activeTabId).toBe(secondNote.id);
  });

  it("does not displace a permanent clean tab — a preview opens beside it", () => {
    const state = reduce(
      { type: "open", tab: firstNote },
      { type: "open", tab: welcome },
      { type: "open", tab: secondNote, placement: "preview" }
    );

    expect(state.tabs.map((tab) => tab.id)).toEqual([firstNote.id, welcome.id, secondNote.id]);
    expect(state.tabs[2]?.preview).toBe(true);
    expect(state.activeTabId).toBe(secondNote.id);
  });

  it("an edit makes a preview permanent, so the next click opens a new one", () => {
    const state = reduce(
      { type: "open", tab: firstNote, placement: "preview" },
      { type: "setDirty", tabId: firstNote.id, isDirty: true },
      { type: "open", tab: secondNote, placement: "preview" }
    );

    expect(state.tabs.map((tab) => tab.id)).toEqual([firstNote.id, secondNote.id]);
    expect(state.tabs[0]?.preview).toBeUndefined();
    expect(state.tabs[1]?.preview).toBe(true);
  });

  it("a keep action makes a preview permanent", () => {
    const state = reduce(
      { type: "open", tab: firstNote, placement: "preview" },
      { type: "keep", tabId: firstNote.id },
      { type: "open", tab: secondNote, placement: "preview" }
    );

    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[0]?.preview).toBeUndefined();
  });

  it("fills an active new-tab page instead of opening beside it", () => {
    const state = reduce(
      { type: "open", tab: createNewTab() },
      { type: "open", tab: firstNote, placement: "preview" }
    );

    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toMatchObject({ id: firstNote.id, preview: true });
    expect(state.activeTabId).toBe(firstNote.id);
  });

  it("replace-active fills a clean tab on screen but appends past a dirty one", () => {
    const clean = reduce(
      { type: "open", tab: firstNote },
      { type: "open", tab: secondNote, placement: "replace-active" }
    );
    expect(clean.tabs.map((tab) => tab.id)).toEqual([secondNote.id]);
    // Replaced for good, not provisionally — the phone's tab is permanent.
    expect(clean.tabs[0]?.preview).toBeUndefined();

    const dirty = reduce(
      { type: "open", tab: firstNote },
      { type: "setDirty", tabId: firstNote.id, isDirty: true },
      { type: "open", tab: secondNote, placement: "replace-active" }
    );
    expect(dirty.tabs.map((tab) => tab.id)).toEqual([firstNote.id, secondNote.id]);
  });

  it("replace-active never takes over a chrome surface", () => {
    const state = reduce(
      { type: "open", tab: welcome },
      { type: "open", tab: firstNote, placement: "replace-active" }
    );

    expect(state.tabs.map((tab) => tab.id)).toEqual([welcome.id, firstNote.id]);
  });

  it("activates an already-open file instead of replacing or duplicating it", () => {
    const state = reduce(
      { type: "open", tab: firstNote, placement: "preview" },
      { type: "open", tab: welcome },
      { type: "open", tab: firstNote, placement: "preview" }
    );

    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe(firstNote.id);
  });

  it("keeps Back working through a tab a file open replaced", () => {
    const state = reduce(
      { type: "open", tab: welcome },
      { type: "open", tab: firstNote, placement: "preview" },
      { type: "open", tab: secondNote, placement: "preview" }
    );

    expect(desktopTabReducer(state, { type: "goBack" }).activeTabId).toBe(welcome.id);
  });
});

describe("createFileTab", () => {
  it("infers editor kind for Markdown files", () => {
    const tab = createFileTab({ rootPath: "/vault", relativePath: "notes/hello.md" });
    expect(tab.kind).toBe("editor");
    expect(tab.title).toBe("hello.md");
    expect(tab.resource).toEqual({ rootPath: "/vault", relativePath: "notes/hello.md" });
  });

  it("infers code-editor kind for TypeScript files", () => {
    const tab = createFileTab({ rootPath: "/vault", relativePath: "src/main.ts" });
    expect(tab.kind).toBe("code-editor");
    expect(tab.title).toBe("main.ts");
  });

  it("infers image-viewer kind for PNG files", () => {
    const tab = createFileTab({ rootPath: "/vault", relativePath: "assets/logo.png" });
    expect(tab.kind).toBe("image-viewer");
  });

  it("infers audio-viewer kind for MP3 files", () => {
    const tab = createFileTab({ rootPath: "/vault", relativePath: "audio/song.mp3" });
    expect(tab.kind).toBe("audio-viewer");
  });

  it("infers video-viewer kind for MP4 files", () => {
    const tab = createFileTab({ rootPath: "/vault", relativePath: "video/clip.mp4" });
    expect(tab.kind).toBe("video-viewer");
  });

  it("produces stable IDs for the same file path", () => {
    const a = createFileTab({ rootPath: "/vault", relativePath: "config.json" });
    const b = createFileTab({ rootPath: "/vault", relativePath: "config.json" });
    expect(a.id).toBe(b.id);
  });

  it("produces different IDs for different files", () => {
    const a = createFileTab({ rootPath: "/vault", relativePath: "a.ts" });
    const b = createFileTab({ rootPath: "/vault", relativePath: "b.ts" });
    expect(a.id).not.toBe(b.id);
  });
});

describe("isDocumentBackedKind", () => {
  it("covers both editor kinds — Markdown and code", () => {
    expect(isDocumentBackedKind("editor")).toBe(true);
    expect(isDocumentBackedKind("code-editor")).toBe(true);
  });

  it("excludes kinds that never read a shell document", () => {
    // Viewers read their own file via the asset protocol; the rest carry
    // their own state or render no file at all.
    for (const kind of [
      "image-viewer",
      "audio-viewer",
      "video-viewer",
      "settings",
      "merge",
      "version-diff",
      "preview",
      "graph",
      "browser",
      "anything-an-extension-makes-up"
    ]) {
      expect(isDocumentBackedKind(kind)).toBe(false);
    }
  });
});

describe("createVersionDiffTab", () => {
  it("titles the tab as a restore and keys it by file and change", () => {
    const tab = createVersionDiffTab(
      { rootPath: "/vault", relativePath: "notes/hello.md" },
      "chg-1"
    );

    expect(tab.kind).toBe("version-diff");
    expect(tab.title).toBe("Restore: hello.md");
    expect(tab.comparedNotePath).toBe("notes/hello.md");
    expect(tab.versionChangeId).toBe("chg-1");
    expect(tab.versionAt).toBeNull();
    expect(tab.id).toBe(
      versionDiffTabId({ rootPath: "/vault", relativePath: "notes/hello.md" }, "chg-1")
    );
  });

  it("keeps the selected version's timestamp on the tab", () => {
    const tab = createVersionDiffTab(
      { rootPath: "/vault", relativePath: "notes/hello.md" },
      "chg-1",
      1755502200000
    );

    expect(tab.versionAt).toBe(1755502200000);
  });

  it("gives each recorded version its own tab", () => {
    const a = createVersionDiffTab({ rootPath: "/vault", relativePath: "n.md" }, "chg-1");
    const b = createVersionDiffTab({ rootPath: "/vault", relativePath: "n.md" }, "chg-2");
    const other = createVersionDiffTab({ rootPath: "/vault", relativePath: "m.md" }, "chg-1");

    expect(a.id).not.toBe(b.id);
    expect(a.id).not.toBe(other.id);
    // Reopening the same comparison raises the existing tab, not a duplicate.
    const state = reduce(
      { type: "open", tab: a },
      { type: "open", tab: b },
      { type: "open", tab: createVersionDiffTab({ rootPath: "/vault", relativePath: "n.md" }, "chg-1") }
    );
    expect(state.tabs.filter((tab) => tab.id === a.id)).toHaveLength(1);
    expect(state.activeTabId).toBe(a.id);
  });
});

describe("tabAccessibleName", () => {
  // 2026-08-18 midday UTC — a fixed instant whose year any locale will show.
  const AT = Date.UTC(2026, 7, 18, 12, 0, 0);

  it("names a restore tab by title and the version's date", () => {
    const tab = createVersionDiffTab(
      { rootPath: "/vault", relativePath: "notes/hello.md" },
      "chg-1",
      AT
    );

    const name = tabAccessibleName(tab);
    expect(name).toContain("Restore: hello.md");
    expect(name).toContain("version from");
    expect(name).toContain("2026");
  });

  it("distinguishes two restore tabs of one file", () => {
    const earlier = createVersionDiffTab(
      { rootPath: "/vault", relativePath: "n.md" },
      "chg-1",
      AT
    );
    const later = createVersionDiffTab(
      { rootPath: "/vault", relativePath: "n.md" },
      "chg-2",
      AT + 3_600_000
    );

    expect(tabAccessibleName(earlier)).not.toBe(tabAccessibleName(later));
  });

  it("falls back to the plain title when no timestamp is known", () => {
    const tab = createVersionDiffTab(
      { rootPath: "/vault", relativePath: "notes/hello.md" },
      "chg-1"
    );

    expect(tabAccessibleName(tab)).toBe("Restore: hello.md");
  });

  it("leaves every other kind of tab alone", () => {
    const tab = createFileTab({ rootPath: "/vault", relativePath: "notes/hello.md" });

    expect(tabAccessibleName(tab)).toBe("hello.md");
  });
});

describe("restoreBreadcrumbSegments", () => {
  it("reads a restore tab as Restore followed by the file's path", () => {
    const tab = createVersionDiffTab(
      { rootPath: "/vault", relativePath: "notes/hello.md" },
      "chg-1"
    );

    expect(restoreBreadcrumbSegments(tab)).toEqual(["Restore", "notes", "hello.md"]);
  });

  it("is null for any other tab or no tab", () => {
    expect(restoreBreadcrumbSegments(
      createFileTab({ rootPath: "/vault", relativePath: "notes/hello.md" })
    )).toBeNull();
    expect(restoreBreadcrumbSegments(null)).toBeNull();
    expect(restoreBreadcrumbSegments(undefined)).toBeNull();
  });
});
