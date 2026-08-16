import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appEvents } from "../events/appEvents";
import {
  EXPLORER_REFRESH_DELAY_MS,
  subscribeExplorerToNoteChanges
} from "./workspaceExplorerRefresh";

const ROOT = "/vault";

const created = (relativePath: string, rootPath = ROOT) =>
  appEvents.emit("note.created", { rootPath, relativePath, origin: "external" });
const deleted = (relativePath: string, rootPath = ROOT) =>
  appEvents.emit("note.deleted", { rootPath, relativePath, origin: "external" });
const renamed = (oldRelativePath: string, newRelativePath: string, rootPath = ROOT) =>
  appEvents.emit("note.renamed", {
    rootPath,
    oldRelativePath,
    newRelativePath,
    origin: "external"
  });
const saved = (relativePath: string, rootPath = ROOT) =>
  appEvents.emit("note.saved", { rootPath, relativePath, origin: "external" });

/** Runs out whatever wait the subscription schedules. */
const settle = () => vi.advanceTimersByTime(EXPLORER_REFRESH_DELAY_MS);

describe("keeping the explorer tree level with the folder", () => {
  let refresh: ReturnType<typeof vi.fn<() => void>>;
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    refresh = vi.fn<() => void>();
    stop = subscribeExplorerToNoteChanges(() => ROOT, refresh);
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it("re-lists the folder when a note appears", () => {
    created("notes/new.md");
    settle();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("re-lists the folder when a note is removed", () => {
    deleted("notes/gone.md");
    settle();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("re-lists the folder when a note is renamed", () => {
    renamed("notes/old.md", "notes/new.md");
    settle();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  /**
   * A save changes bytes, not the shape of the tree, and the tree shows only
   * names. Listing the whole folder for each one would put a native call behind
   * every autosave for nothing.
   */
  it("leaves the tree alone when a note is only edited", () => {
    saved("notes/edited.md");
    settle();

    expect(refresh).not.toHaveBeenCalled();
  });

  /**
   * A `git checkout` announces one note at a time. The work each announcement
   * asks for is the same whole-folder listing, so it should happen once.
   */
  it("lists once for a burst of changes", () => {
    created("a.md");
    deleted("b.md");
    renamed("c.md", "d.md");
    created("e.md");
    settle();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("waits before listing, rather than listing on the first change", () => {
    created("a.md");

    expect(refresh).not.toHaveBeenCalled();
  });

  it("ignores changes in a workspace it is not showing", () => {
    created("a.md", "/other");
    deleted("b.md", "/other");
    renamed("c.md", "d.md", "/other");
    settle();

    expect(refresh).not.toHaveBeenCalled();
  });

  /**
   * The listing is asynchronous and dispatches into a component that may be
   * gone. Leaving a timer armed past teardown is how a closed workspace ends up
   * writing over the tree of the one that replaced it.
   */
  it("drops a listing that was still pending when it stopped", () => {
    created("a.md");
    stop();
    settle();

    expect(refresh).not.toHaveBeenCalled();
  });

  it("hears nothing after it stops", () => {
    stop();
    created("a.md");
    settle();

    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("an explorer whose workspace is switched", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("follows the workspace it is showing now", () => {
    let root = "/first";
    const refresh = vi.fn();
    const stop = subscribeExplorerToNoteChanges(() => root, refresh);

    created("a.md", "/second");
    settle();
    expect(refresh).not.toHaveBeenCalled();

    root = "/second";
    created("b.md", "/second");
    settle();
    expect(refresh).toHaveBeenCalledTimes(1);

    stop();
  });
});
