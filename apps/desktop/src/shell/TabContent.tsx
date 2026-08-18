import { lazy, Suspense, useMemo } from "react";
import type { NoteIndexEntry } from "@thinkbrain/core";
import { cn } from "../lib/utils";
import { createVaultAssetResolver } from "../native/assets";
import { useSettingsStore } from "../settings/settingsStore";
import { desktopTabRegistry } from "../tabs/tabRegistry";
import type { DesktopTab } from "../tabs/tabModel";
import type { DocumentViewState } from "./shellTypes";
import { SettingsTab } from "../settings/SettingsTab";
import { MergeTab } from "../sync/MergeTab";
import { Unavailable } from "./Unavailable";

/**
 * Props for the active tab content surface.
 */
type TabContentProps = {
  readonly tab: DesktopTab | null;
  readonly document: DocumentViewState | undefined;
  readonly onChange: (tabId: string, contents: string) => void;
  readonly onSave: (tab: DesktopTab) => Promise<boolean>;
  readonly noteIndex?: readonly NoteIndexEntry[];
  readonly onOpenNote?: (relativePath: string) => void;
  /**
   * Unsaved text of an editor open on the note a merge tab is about.
   *
   * Only a merge tab reads it: "this computer's version" has to be what the
   * user is looking at, and the last save may be several paragraphs behind.
   */
  readonly unsavedNoteContents?: string | null;
};

/** Lazy-loaded Markdown editor; only fetched when an editor tab is rendered. */
const MarkdownEditor = lazy(async () => {
  const module = await import("../tabs/MarkdownEditor");
  return { default: module.MarkdownEditor };
});

/**
 * Renders the body of the active editor tab.
 *
 * Switches on `tab.kind` to pick the right surface. Most non-editor kinds are
 * not yet backed by a service and show an `Unavailable` placeholder. Editor
 * tabs render the lazy-loaded `MarkdownEditor` once the document is ready.
 */
export function TabContent({
  tab,
  document,
  onChange,
  onSave,
  noteIndex,
  onOpenNote,
  unsavedNoteContents
}: TabContentProps) {
  // Hooks must run before any early return, so both are read up front even
  // though only the Markdown editor branch consumes them.
  const livePreview = useSettingsStore(
    (state) => state.getEffectiveValue("editor.livePreview") !== false
  );
  const rootPath = tab?.resource?.rootPath;
  const relativePath = tab?.resource?.relativePath;
  const resolveAssetUrl = useMemo(
    () =>
      rootPath && relativePath
        ? createVaultAssetResolver(rootPath, relativePath)
        : undefined,
    [rootPath, relativePath]
  );

  if (!tab) {
    return (
      <div className="grid grid-cols-[3.2rem_minmax(0,1fr)] py-[1.1rem] font-mono text-[0.84rem] leading-1.65">
        <span className="text-muted-foreground pr-[0.8rem] text-right select-none">1</span>
        <pre className={cn("m-0 overflow-visible whitespace-pre-wrap")}>
          {`# Welcome to ThinkBrain\n\nOpen a workspace, then select a Markdown file to start editing it.`}
        </pre>
      </div>
    );
  }

  const view = desktopTabRegistry.get(tab.kind);
  if (!view?.isAvailable) {
    return (
      <Unavailable
        title={view?.label ?? tab.title}
        description={view?.unavailableMessage ?? "This tab type is unavailable."}
      />
    );
  }

  // A contributed kind brings its own renderer. Checked before the built-in
  // branches so an extension tab never falls through to the editor, which would
  // report a missing document for a tab that has no document.
  if (view.factory) {
    return <>{view.factory({ rootPath: rootPath ?? null, tabId: tab.id })}</>;
  }

  if (tab.kind === "browser") {
    return (
      <Unavailable
        title="Browser tab"
        description="External page rendering is unavailable until the Tauri browser view is connected."
      />
    );
  }

  if (tab.kind === "graph") {
    return (
      <Unavailable
        title="Graph view"
        description="Graph visualization is planned after link indexing is available."
      />
    );
  }

  if (tab.kind === "preview") {
    return (
      <div className="my-8 mx-auto max-w-2xl px-8 leading-1.6">
        <h1 className="text-[2rem]">Preview unavailable</h1>
        <p>Open a Markdown note to view its rendered preview.</p>
      </div>
    );
  }

  if (tab.kind === "settings") {
    return <SettingsTab />;
  }

  // Named by the conflict copy, which is what identifies a conflict everywhere
  // else — one note can have a copy from each of two machines.
  if (tab.kind === "merge") {
    return (
      <MergeTab
        rootPath={rootPath ?? null}
        copyPath={relativePath ?? null}
        buffer={unsavedNoteContents ?? null}
      />
    );
  }

  if (!document || document.phase === "loading") {
    return (
      <Unavailable
        title="Loading note"
        description="Reading the Markdown document from the workspace…"
      />
    );
  }

  if (document.phase === "error" && !document.contents) {
    return (
      <Unavailable
        title="Could not open note"
        description={document.error ?? "The Markdown document could not be read."}
      />
    );
  }

  return (
    <Suspense
      fallback={<Unavailable title="Loading editor" description="Preparing the Markdown editor…" />}
    >
      <MarkdownEditor
        key={tab.id}
        value={document.contents}
        isSaving={document.phase === "saving"}
        error={document.error}
        rootPath={rootPath ?? null}
        relativePath={relativePath ?? null}
        livePreview={livePreview}
        resolveAssetUrl={resolveAssetUrl}
        noteIndex={noteIndex}
        onOpenNote={onOpenNote}
        // Switching tabs unmounts this editor; the id is how the next mount
        // finds the cursor, scroll and undo history it left behind.
        stateKey={tab.id}
        onChange={(contents) => onChange(tab.id, contents)}
        onSave={() => {
          void onSave(tab);
        }}
      />
    </Suspense>
  );
}
