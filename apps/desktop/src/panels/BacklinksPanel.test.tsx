// @vitest-environment happy-dom
import { buildWikiLinkIndex, EMPTY_WIKI_LINK_INDEX, parseNote } from "@thinkbrain/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWikiLinkIndexStore } from "../wikiLinks/wikiLinkIndexStore";
import { BacklinksPanel } from "./BacklinksPanel";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const input = (relativePath: string, contents: string) => ({
  relativePath,
  contents,
  parsedNote: parseNote(contents)
});

const renderPanel = async (
  props: Partial<React.ComponentProps<typeof BacklinksPanel>> = {}
): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(
    <BacklinksPanel
      rootPath="/vault"
      relativePath="Target.md"
      onOpenNote={() => undefined}
      {...props}
    />
  ));
  return container;
};

const setReadyIndex = (sources: readonly { path: string; contents: string }[]) => {
  const index = buildWikiLinkIndex([
    ...sources.map((source) => input(source.path, source.contents)),
    input("Target.md", "target")
  ]);
  useWikiLinkIndexStore.setState({
    rootPath: "/vault",
    status: "ready",
    wikiLinkIndex: index,
    noteIndex: index.noteIndex
  });
};

beforeEach(() => {
  useWikiLinkIndexStore.setState({
    rootPath: null,
    status: "idle",
    wikiLinkIndex: EMPTY_WIKI_LINK_INDEX,
    noteIndex: []
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("BacklinksPanel", () => {
  it("shows the no-note state", async () => {
    const host = await renderPanel({ relativePath: null });
    expect(host.textContent).toContain("No note selected");
    expect(host.textContent).toContain("Open a Markdown note to see what links to it.");
  });

  it("shows the indexing state for an in-progress matching workspace", async () => {
    useWikiLinkIndexStore.setState({ rootPath: "/vault", status: "indexing" });
    const host = await renderPanel();
    expect(host.textContent).toContain("Indexing links");
    expect(host.textContent).toContain(
      "Backlinks will appear when this workspace finishes indexing."
    );
  });

  it("shows the error state", async () => {
    useWikiLinkIndexStore.setState({ rootPath: "/vault", status: "error" });
    const host = await renderPanel();
    expect(host.textContent).toContain("Backlinks unavailable");
    expect(host.textContent).toContain("The workspace link index could not be built.");
  });

  it("shows the ready empty state", async () => {
    setReadyIndex([]);
    const host = await renderPanel();
    expect(host.textContent).toContain("No backlinks");
    expect(host.textContent).toContain("No notes link to this note yet.");
  });

  it("renders metadata title, path, context, and opens the source note", async () => {
    setReadyIndex([{
      path: "folder/source.md",
      contents: "---\ntitle: Source title\n---\nRead [[Target|the target]] here"
    }]);
    const onOpenNote = vi.fn();
    const host = await renderPanel({ onOpenNote });
    const button = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Open backlink from Source title"]'
    );

    expect(host.querySelector('nav[aria-label="Backlinks to current note"]')).not.toBeNull();
    expect(button?.textContent).toContain("Source title");
    expect(button?.textContent).toContain("folder/source.md");
    expect(button?.textContent).toContain("Read [[Target|the target]] here");
    await act(async () => button?.click());
    expect(onOpenNote).toHaveBeenCalledWith("folder/source.md");
  });

  it("reacts to store updates and falls back to the filename title", async () => {
    setReadyIndex([]);
    const host = await renderPanel();
    expect(host.textContent).toContain("No backlinks");

    await act(async () => {
      setReadyIndex([{ path: "notes/plain.md", contents: "See [[Target]]" }]);
    });

    expect(host.querySelector(
      'button[aria-label="Open backlink from plain"]'
    )?.textContent).toContain("See [[Target]]");
  });
});
