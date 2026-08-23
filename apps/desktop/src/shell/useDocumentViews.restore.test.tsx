// @vitest-environment happy-dom
/**
 * What a tab must do after a kept version is put back over a note.
 *
 * The in-place re-read is the wrong tool here and it fails silently: it drops
 * any document that is not `ready`, which is exactly the state a note that
 * could not be decoded is in. Wiring the recovery pane to it left the pane
 * showing the damage after a restore had already fixed the file.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DesktopTabState } from "../tabs/tabModel";
import { useDocumentViews, type DocumentViews } from "./useDocumentViews";

const loadWorkspaceDocument = vi.fn();

vi.mock("../workspace/workspaceDocumentModel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../workspace/workspaceDocumentModel")>();
  return {
    ...actual,
    loadWorkspaceDocument: () => loadWorkspaceDocument(),
    saveWorkspaceDocument: () => Promise.resolve({ ok: true })
  };
});
vi.mock("../workspace/workspaceDocumentAdapter", () => ({ workspaceDocumentApi: {} }));
vi.mock("../events/appEvents", () => ({ appEvents: { emit: () => {} } }));
vi.mock("../tabs/editorStateCache", () => ({ releaseEditorStatesExcept: () => {} }));

const TAB_ID = "editor:/vault:note.md";
const TABS: DesktopTabState = {
  tabs: [
    {
      id: TAB_ID,
      title: "note.md",
      kind: "editor",
      resource: { rootPath: "/vault", relativePath: "note.md" }
    }
  ],
  activeTabId: TAB_ID,
  closeRequest: null
} as DesktopTabState;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let views: DocumentViews | null = null;

beforeEach(() => {
  loadWorkspaceDocument.mockReset();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  views = null;
});

async function mountViews(): Promise<DocumentViews> {
  function Host() {
    views = useDocumentViews({ tabState: TABS, dispatchTabs: () => {} });
    return null;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<Host />);
  });
  if (!views) throw new Error("the hook did not run");
  return views;
}

/** Puts the tab into the state a note that could not be decoded leaves it in. */
async function openDamaged(): Promise<DocumentViews> {
  loadWorkspaceDocument.mockResolvedValueOnce({
    ok: false,
    message: "This note is not readable as text.",
    code: "workspace.note_unreadable"
  });
  const mounted = await mountViews();
  await act(async () => {
    mounted.loadDocumentIntoView(TAB_ID, "/vault", "note.md");
  });
  return mounted;
}

describe("showing a note again after a version is restored over it", () => {
  it("leaves a damaged tab damaged when re-read in place", async () => {
    // Characterises the guard the bug came from, so the reason the restore
    // cannot use this path stays written down.
    const mounted = await openDamaged();
    expect(views?.documents[TAB_ID]?.phase).toBe("error");

    loadWorkspaceDocument.mockResolvedValueOnce({
      ok: true,
      document: { contents: "the version that was put back" }
    });
    await act(async () => {
      mounted.reloadDocumentInPlace(TAB_ID, "/vault", "note.md");
    });

    expect(views?.documents[TAB_ID]?.phase).toBe("error");
    expect(views?.documents[TAB_ID]?.contents).toBe("");
  });

  it("shows the restored text when loaded the ordinary way", async () => {
    const mounted = await openDamaged();

    loadWorkspaceDocument.mockResolvedValueOnce({
      ok: true,
      document: { contents: "the version that was put back" }
    });
    await act(async () => {
      mounted.loadDocumentIntoView(TAB_ID, "/vault", "note.md");
    });

    expect(views?.documents[TAB_ID]?.phase).toBe("ready");
    expect(views?.documents[TAB_ID]?.contents).toBe("the version that was put back");
    // The pane routes on this, so it has to be gone or the damage stays on screen.
    expect(views?.documents[TAB_ID]?.errorCode).toBeFalsy();
  });

  it("clears the emptied mark when the restored text arrives", async () => {
    loadWorkspaceDocument.mockResolvedValueOnce({ ok: true, document: { contents: "" } });
    const mounted = await mountViews();
    await act(async () => {
      mounted.loadDocumentIntoView(TAB_ID, "/vault", "note.md");
    });

    loadWorkspaceDocument.mockResolvedValueOnce({
      ok: true,
      document: { contents: "the version that was put back" }
    });
    await act(async () => {
      mounted.loadDocumentIntoView(TAB_ID, "/vault", "note.md");
    });

    expect(views?.documents[TAB_ID]?.contents).toBe("the version that was put back");
    expect(views?.documents[TAB_ID]?.emptiedOutside).toBeFalsy();
  });
});
