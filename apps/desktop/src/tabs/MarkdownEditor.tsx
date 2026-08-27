import { Compartment, EditorState, StateEffect } from "@codemirror/state";
import { keymap, EditorView } from "@codemirror/view";
import type { NoteIndexEntry } from "@thinkbrain/core";
import { useEffect, useMemo, useRef, useState } from "react";

import { EditorHeaderSlot } from "./editorHeaderRegistry.tsx";
import { recallEditorState, rememberEditorState } from "./editorStateCache";
import { livePreview as livePreviewExtension } from "./livePreview";
import {
  markdownEditorHookRegistry,
  type MarkdownEditorHookPayload
} from "./markdownEditorHooks";
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

/** CodeMirror 6 is isolated behind this controlled, document-value boundary. */
/**
 * The smallest edit that turns `current` into `next`, or null if they match.
 *
 * A whole-document replacement cannot carry a selection across it, so an edit
 * arriving as new `value` — the metadata widget hands back the entire note with
 * one frontmatter key changed — used to throw the cursor to the end of the
 * document and bundle itself into one undo step with everything else. Trimming
 * to the differing middle keeps positions after it mapped, which is all the
 * cursor needs.
 */
function minimalChange(
  current: string,
  next: string
): { from: number; to: number; insert: string } | null {
  if (current === next) return null;

  let start = 0;
  const shortest = Math.min(current.length, next.length);
  while (start < shortest && current[start] === next[start]) start += 1;

  let endCurrent = current.length;
  let endNext = next.length;
  while (
    endCurrent > start &&
    endNext > start &&
    current[endCurrent - 1] === next[endNext - 1]
  ) {
    endCurrent -= 1;
    endNext -= 1;
  }

  return { from: start, to: endCurrent, insert: next.slice(start, endNext) };
}

/** Offset of the first character after any frontmatter block. */
function bodyStart(source: string): number {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(source);
  return match ? match[0].length : 0;
}

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
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  // Lazy `useState` rather than `useRef`: it gives one stable instance per
  // view without allocating a throwaway Compartment on every render.
  const [livePreviewCompartment] = useState(() => new Compartment());
  const [wikiLinkAutocompleteCompartment] = useState(() => new Compartment());
  const livePreviewRef = useRef(livePreview);
  const resolveAssetUrlRef = useRef(resolveAssetUrl);
  const noteIndexRef = useRef(noteIndex);
  const onOpenNoteRef = useRef(onOpenNote);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
    resolveAssetUrlRef.current = resolveAssetUrl;
    noteIndexRef.current = noteIndex;
    onOpenNoteRef.current = onOpenNote;
  }, [onChange, onSave, resolveAssetUrl, noteIndex, onOpenNote]);

  useEffect(() => {
    if (!hostRef.current) {
      console.error("[MarkdownEditor] host element missing; cannot mount CodeMirror.");
      return;
    }

    const payload: MarkdownEditorHookPayload = {
      onChange: (nextValue) => onChangeRef.current(nextValue),
      onSave: () => onSaveRef.current(),
      livePreviewCompartment,
      wikiLinkAutocompleteCompartment,
      livePreviewEnabled: livePreviewRef.current,
      resolveAssetUrl: (src) => resolveAssetUrlRef.current?.(src) ?? null,
      noteIndex: noteIndexRef.current,
      onOpenNote: (relativePath) => onOpenNoteRef.current?.(relativePath)
    };
    const extensions = markdownEditorHookRegistry.getExtensions(payload, undefined);
    const keybindings = markdownEditorHookRegistry.getKeybindings(payload, undefined);
    const configuration = [...extensions, keymap.of(keybindings)];
    const parked = stateKey === undefined ? undefined : recallEditorState(stateKey);

    const view = new EditorView({
      parent: hostRef.current,
      state:
        parked?.state ??
        EditorState.create({
          doc: valueRef.current,
          // Past the frontmatter, not at byte 0. A document's default selection
          // sits inside the block, which live preview reads as "the cursor is in
          // here" and reveals it — so an entry opened showing the very thing the
          // dateline is there to replace. The body is also simply where you write.
          selection: { anchor: bodyStart(valueRef.current) },
          extensions: configuration
        })
    });
    viewRef.current = view;

    if (parked) {
      // The parked state carries the previous mount's extensions, and those
      // close over that mount's callbacks. Swapping the whole configuration
      // rebinds them to this one; the state fields keyed to the same extension
      // instances — the undo history above all — carry across untouched.
      view.dispatch({ effects: StateEffect.reconfigure.of(configuration) });
      view.scrollDOM.scrollTop = parked.scrollTop;
    }

    return () => {
      if (stateKey !== undefined) {
        // Scroll position is DOM state rather than editor state, so it has to
        // be taken before the view goes.
        rememberEditorState(stateKey, {
          state: view.state,
          scrollTop: view.scrollDOM.scrollTop
        });
      }
      view.destroy();
      viewRef.current = null;
    };
    // The compartments are created once per component instance, so this effect
    // still runs exactly once; they are listed only to satisfy exhaustive-deps.
  }, [livePreviewCompartment, wikiLinkAutocompleteCompartment, stateKey]);

  useEffect(() => {
    valueRef.current = value;
    const view = viewRef.current;
    if (!view) return;
    const change = minimalChange(view.state.doc.toString(), value);
    if (change) view.dispatch({ changes: change });
  }, [value]);

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
  }, [livePreview, noteIndex, livePreviewCompartment, wikiLinkAutocompleteCompartment]);

  // Stable context for EditorHeaderSlot so its `applies` filter memo holds
  // across renders that don't change the document identity or contents.
  const headerContext = useMemo(
    () => ({ rootPath, relativePath, contents: value, applyEdit: onChange }),
    [rootPath, relativePath, value, onChange]
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-busy={isSaving} aria-label="Markdown document">
      {error && (
        <p
          className="m-0 px-[0.9rem] py-2 border-b border-b-[color-mix(in_srgb,var(--color-destructive)_50%,var(--color-border))] text-danger bg-[color-mix(in_srgb,var(--color-destructive)_8%,transparent)] text-xs"
          role="alert"
        >
          {error}
        </p>
      )}
      <EditorHeaderSlot
        context={headerContext}
      />
      <div
        className="min-h-0 flex-1 overflow-auto cursor-text [&_.cm-editor]:min-h-full [&_.cm-editor]:cursor-text [&_.cm-editor]:bg-editor [&_.cm-editor]:text-foreground [&_.cm-editor]:font-mono [&_.cm-editor]:text-sm [&_.cm-editor]:leading-1.65 [&_.cm-scroller]:overflow-auto [&_.cm-scroller]:cursor-text [&_.cm-content]:min-h-full [&_.cm-content]:pt-4 [&_.cm-content]:px-5 [&_.cm-content]:pb-16 [&_.cm-focused]:outline-none"
        ref={hostRef}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return;
          const view = viewRef.current;
          if (!view) return;
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos === null || pos < view.state.doc.length) return;
          event.preventDefault();
          view.dispatch({ selection: { anchor: view.state.doc.length } });
          view.focus();
        }}
      />
    </section>
  );
}
