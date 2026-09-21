import { getBacklinkDetails } from "@thinkbrain/core";

import { Unavailable } from "../shell/Unavailable";
import { useWikiLinkIndexStore } from "../wikiLinks/wikiLinkIndexStore";

export interface BacklinksPanelProps {
  readonly rootPath: string | null;
  readonly relativePath: string | null;
  readonly onOpenNote: (relativePath: string) => void;
}

/** Shows notes that link to the active Markdown note. */
export function BacklinksPanel({
  rootPath,
  relativePath,
  onOpenNote
}: BacklinksPanelProps) {
  // Keep subscriptions granular so metadata or lifecycle-only updates do not
  // force unrelated store state into this panel's render contract.
  const indexedRoot = useWikiLinkIndexStore((state) => state.rootPath);
  const status = useWikiLinkIndexStore((state) => state.status);
  const index = useWikiLinkIndexStore((state) => state.wikiLinkIndex);
  const noteIndex = useWikiLinkIndexStore((state) => state.noteIndex);

  if (rootPath === null || relativePath === null) {
    return (
      <Unavailable
        title="No note selected"
        description="Open a Markdown note to see what links to it."
      />
    );
  }

  if (
    indexedRoot !== rootPath
    || status === "indexing"
    || (status === "idle" && indexedRoot !== null)
  ) {
    return (
      <Unavailable
        title="Indexing links"
        description="Backlinks will appear when this workspace finishes indexing."
      />
    );
  }

  if (status === "error") {
    return (
      <Unavailable
        title="Backlinks unavailable"
        description="The workspace link index could not be built."
      />
    );
  }

  const details = getBacklinkDetails(index, relativePath);
  if (details.length === 0) {
    return (
      <Unavailable
        title="No backlinks"
        description="No notes link to this note yet."
      />
    );
  }

  return (
    <nav
      aria-label="Backlinks to current note"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2"
    >
      <ul className="m-0 list-none space-y-1 p-0">
        {details.map((detail) => {
          const entry = noteIndex.find(
            (candidate) => candidate.relativePath === detail.relativePath
          );
          const metadataTitle = entry?.title?.trim();
          const fileName = detail.relativePath.split("/").pop() ?? detail.relativePath;
          const title = metadataTitle || fileName.replace(/\.md$/i, "");

          return (
            <li key={detail.relativePath}>
              <button
                type="button"
                aria-label={`Open backlink from ${title}`}
                className="w-full cursor-pointer rounded border-0 bg-transparent px-2 py-1.5 text-left hover:bg-muted tn-focus-ring pointer-coarse:min-h-11 pointer-coarse:py-2"
                onClick={() => onOpenNote(detail.relativePath)}
              >
                <span className="block truncate text-xs font-medium text-foreground pointer-coarse:text-sm">
                  {title}
                </span>
                <span className="block truncate text-[0.68rem] text-muted-foreground pointer-coarse:text-xs">
                  {detail.relativePath}
                </span>
                <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {detail.context}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
