import { useRef, useState } from "react";

/**
 * Editable title row at the top of a note. The title IS the filename
 * (minus `.md`); editing it renames the file and the watcher retargets the tab.
 *
 * Hidden for journal entries — the journal's own metadata header provides a
 * curated dateline instead.
 */
export function NoteTitleRow({
  relativePath,
  onRename
}: {
  readonly relativePath: string | null;
  readonly onRename?: (newRelativePath: string) => Promise<void>;
}) {
  const filename = relativePath?.split("/").filter(Boolean).at(-1) ?? "";
  const dot = filename.lastIndexOf(".");
  const title = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = filename.slice(title.length);
  const [edit, setEdit] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  if (!relativePath) return null;
  const draft = edit ?? title;

  const commit = () => {
    if (cancelledRef.current) { cancelledRef.current = false; return; }
    const next = draft.trim();
    if (!next || next === title || !onRename) { setEdit(null); return; }
    const dir = relativePath.slice(0, relativePath.lastIndexOf("/") + 1);
    void onRename(`${dir}${next}${ext}`).catch((e: unknown) => {
      console.error("[NoteTitleRow] rename failed:", e);
      setEdit(null);
    });
  };

  return (
    <div className="flex h-10 shrink-0 items-center border-b border-border bg-editor px-3">
      <input
        className="min-w-0 flex-1 rounded-small border border-transparent bg-transparent px-1 text-base font-semibold text-foreground outline-none hover:border-border focus:border-primary disabled:cursor-default"
        aria-label="Note title"
        disabled={!onRename}
        value={draft}
        onChange={(e) => setEdit(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { cancelledRef.current = true; setEdit(null); e.currentTarget.blur(); }
        }}
      />
    </div>
  );
}
