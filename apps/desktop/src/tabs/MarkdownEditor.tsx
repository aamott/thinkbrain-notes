import { Compartment } from "@codemirror/state";
import { keymap, EditorView } from "@codemirror/view";
import type { NoteIndexEntry } from "@thinkbrain/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EditorHeaderSlot } from "./editorHeaderRegistry.tsx";
import { notifyEditorCommands } from "./editorCommands";
import { EditorErrorBanner } from "./EditorErrorBanner";
import { frontmatterGuard } from "./frontmatterGuard";
import { livePreview as livePreviewExtension } from "./livePreview";
import { markdownFormat } from "./markdownFormat";
import {
  markdownEditorHookRegistry,
  type MarkdownEditorHookPayload
} from "./markdownEditorHooks";
import {
  useCodeMirrorView,
  type CodeMirrorCallbacks,
  type MountedEditorView
} from "./useCodeMirrorView";
import { wikiLinkAutocomplete as wikiLinkAutocompleteExtension } from "./wikiLinkAutocomplete";

export interface MarkdownEditorProps {
  readonly value: string;
  readonly isSaving?: boolean;
  readonly error?: string | null;
  /** Workspace root of the open document, passed to header contributions (D44). */
  readonly rootPath?: string | null;
  /** Workspace-relative path of the open document, passed to header contributions. */
  readonly relativePath?: string | null;
  /** Renders Markdown formatted inline, revealing source at the cursor. */
  readonly livePreview?: boolean;
  /** Resolves relative image sources to loadable URLs. */
  readonly resolveAssetUrl?: (src: string) => string | null;
  /** Vault note index for resolving `[[Target]]` wiki links at click time. */
  readonly noteIndex?: readonly NoteIndexEntry[];
  /** Called when the user clicks a resolved `[[Target]]` wiki link. */
  readonly onOpenNote?: (relativePath: string) => void;
  /**
   * Identity to park the editor's own state under while this tab is not the
   * one on screen — the tab id, in the shell. Omitted where there is no tab to
   * come back to, and then nothing is remembered.
   */
  readonly stateKey?: string;
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
}

/** Offset of the first character after any frontmatter block. */
function bodyStart(source: string): number {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(source);
  return match ? match[0].length : 0;
}

/** CodeMirror 6 is isolated behind this controlled, document-value boundary. */
export function MarkdownEditor({
  value,
  isSaving = false,
  error,
  rootPath = null,
  relativePath = null,
  livePreview = true,
  resolveAssetUrl,
  noteIndex,
  onOpenNote,
  stateKey,
  onChange,
  onSave
}: MarkdownEditorProps) {
  // Lazy `useState` rather than `useRef`: it gives one stable instance per
  // view without allocating a throwaway Compartment on every render.
  const [livePreviewCompartment] = useState(() => new Compartment());
  const [wikiLinkAutocompleteCompartment] = useState(() => new Compartment());
  const livePreviewRef = useRef(livePreview);
  const resolveAssetUrlRef = useRef(resolveAssetUrl);
  const noteIndexRef = useRef(noteIndex);
  const onOpenNoteRef = useRef(onOpenNote);

  useEffect(() => {
    resolveAssetUrlRef.current = resolveAssetUrl;
    noteIndexRef.current = noteIndex;
    onOpenNoteRef.current = onOpenNote;
  }, [resolveAssetUrl, noteIndex, onOpenNote]);

  const buildView = useCallback(
    (callbacks: CodeMirrorCallbacks): MountedEditorView => {
      const payload: MarkdownEditorHookPayload = {
        onChange: callbacks.onChange,
        onSave: callbacks.onSave,
        livePreviewCompartment,
        wikiLinkAutocompleteCompartment,
        livePreviewEnabled: livePreviewRef.current,
        resolveAssetUrl: (src) => resolveAssetUrlRef.current?.(src) ?? null,
        noteIndex: noteIndexRef.current,
        onOpenNote: (relativePath) => onOpenNoteRef.current?.(relativePath)
      };
      const extensions = markdownEditorHookRegistry.getExtensions(payload, undefined);
      const keybindings = markdownEditorHookRegistry.getKeybindings(payload, undefined);
      return {
        extensions: [
          ...extensions,
          keymap.of(keybindings),
          // Frontmatter is hidden by a line class, not an atomic range — the
          // guard stops body deletions (held Backspace) from eating into it.
          frontmatterGuard(),
          // Document edits and undo/redo all change the document — every one of
          // them can flip the header buttons' enabled state.
          EditorView.updateListener.of((update) => {
            if (update.docChanged && stateKey !== undefined) {
              notifyEditorCommands(stateKey);
            }
          })
        ],
        // Past the frontmatter, not at byte 0. A document's default selection
        // sits inside the block, which live preview reads as "the cursor is in
        // here" and reveals it — so an entry opened showing the very thing the
        // dateline is there to replace. The body is also simply where you write.
        selectionAnchor: bodyStart,
        // Markdown-only command surface: its presence is what tells the phone
        // shell's formatting bar to render for this tab.
        commands: (getView) => ({
          format: (action) => {
            const view = getView();
            if (!view) return;
            view.dispatch(markdownFormat(view.state, action));
            view.focus();
          }
        })
      };
    },
    // The compartments are created once per component instance, so this still
    // mounts the view exactly once; they are listed only to satisfy
    // exhaustive-deps.
    [livePreviewCompartment, wikiLinkAutocompleteCompartment, stateKey]
  );

  const { hostRef, viewRef, onHostPointerDown } = useCodeMirrorView({
    value,
    stateKey,
    label: "[MarkdownEditor]",
    onChange,
    onSave,
    mount: buildView
  });

  // Reconfigure both compartmented extensions (live preview + wiki-link
  // autocomplete) when their inputs change. Both depend on `noteIndex` — the
  // live preview uses it for resolved/broken link styling and click resolution,
  // the autocomplete uses it for its suggestion list — so a noteIndex change
  // must reconfigure both or the styling and click paths hold a stale index
  // while the autocomplete stays fresh. Reconfiguring swaps the extension
  // without recreating the state, so cursor, scroll, and undo history survive.
  useEffect(() => {
    livePreviewRef.current = livePreview;
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        livePreviewCompartment.reconfigure(
          livePreview
            ? livePreviewExtension({
                resolveAssetUrl: (src) => resolveAssetUrlRef.current?.(src) ?? null,
                noteIndex: noteIndex ?? [],
                onOpenNote: (relativePath) => onOpenNoteRef.current?.(relativePath)
              })
            : []
        ),
        wikiLinkAutocompleteCompartment.reconfigure(
          wikiLinkAutocompleteExtension(noteIndex ?? [])
        )
      ]
    });
  }, [livePreview, noteIndex, livePreviewCompartment, wikiLinkAutocompleteCompartment, viewRef]);

  // Stable context for EditorHeaderSlot so its `applies` filter memo holds
  // across renders that don't change the document identity or contents.
  const headerContext = useMemo(
    () => ({ rootPath, relativePath, contents: value, applyEdit: onChange }),
    [rootPath, relativePath, value, onChange]
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-busy={isSaving} aria-label="Markdown document">
      {error && <EditorErrorBanner error={error} />}
      <EditorHeaderSlot
        context={headerContext}
      />
      <div
        className="min-h-0 flex-1 overflow-auto cursor-text [&_.cm-editor]:min-h-full [&_.cm-editor]:cursor-text [&_.cm-editor]:bg-editor [&_.cm-editor]:text-foreground [&_.cm-editor]:font-mono [&_.cm-editor]:text-sm [&_.cm-editor]:leading-1.65 [&_.cm-scroller]:overflow-auto [&_.cm-scroller]:cursor-text [&_.cm-content]:min-h-full [&_.cm-content]:pt-4 [&_.cm-content]:px-5 [&_.cm-content]:pb-16 [&_.cm-focused]:outline-none"
        ref={hostRef}
        onPointerDown={onHostPointerDown}
      />
    </section>
  );
}
