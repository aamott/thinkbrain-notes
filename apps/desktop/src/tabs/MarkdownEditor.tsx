import { Compartment, EditorState } from "@codemirror/state";
import { keymap, EditorView } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";

import { EditorHeaderSlot } from "./editorHeaderRegistry";
import { livePreview as livePreviewExtension } from "./livePreview";
import {
  markdownEditorHookRegistry,
  type MarkdownEditorHookPayload
} from "./markdownEditorHooks";

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
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
}

/** CodeMirror 6 is isolated behind this controlled, document-value boundary. */
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
  const livePreviewRef = useRef(livePreview);
  const resolveAssetUrlRef = useRef(resolveAssetUrl);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
    resolveAssetUrlRef.current = resolveAssetUrl;
  }, [onChange, onSave, resolveAssetUrl]);

  useEffect(() => {
    if (!hostRef.current) {
      console.error("[MarkdownEditor] host element missing; cannot mount CodeMirror.");
      return;
    }

    const payload: MarkdownEditorHookPayload = {
      onChange: (nextValue) => onChangeRef.current(nextValue),
      onSave: () => onSaveRef.current(),
      livePreviewCompartment,
      livePreviewEnabled: livePreviewRef.current,
      resolveAssetUrl: (src) => resolveAssetUrlRef.current?.(src) ?? null
    };
    const extensions = markdownEditorHookRegistry.getExtensions(payload, undefined);
    const keybindings = markdownEditorHookRegistry.getKeybindings(payload, undefined);
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: valueRef.current,
        // Past the frontmatter, not at byte 0. A document's default selection
        // sits inside the block, which live preview reads as "the cursor is in
        // here" and reveals it — so an entry opened showing the very thing the
        // dateline is there to replace. The body is also simply where you write.
        selection: { anchor: bodyStart(valueRef.current) },
        extensions: [...extensions, keymap.of(keybindings)]
      })
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The compartment is created once per component instance, so this effect
    // still runs exactly once; it is listed only to satisfy exhaustive-deps.
  }, [livePreviewCompartment]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === view.state.doc.toString()) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    livePreviewRef.current = livePreview;
    const view = viewRef.current;
    if (!view) return;
    // Reconfiguring the compartment swaps the extension without recreating the
    // state, so the cursor, scroll position and undo history all survive.
    view.dispatch({
      effects: livePreviewCompartment.reconfigure(
        livePreview
          ? livePreviewExtension({
              resolveAssetUrl: (src) => resolveAssetUrlRef.current?.(src) ?? null
            })
          : []
      )
    });
  }, [livePreview, livePreviewCompartment]);

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-busy={isSaving} aria-label="Markdown document">
      <div className="flex min-h-8 items-center justify-between gap-3 px-[0.9rem] border-b border-border text-muted-foreground text-[0.6875rem]">
        <span>{isSaving ? "Saving…" : "Markdown"}</span>
        <button
          type="button"
          className="rounded-small border border-border bg-primary px-2 py-1 text-primary-foreground cursor-pointer disabled:cursor-wait disabled:opacity-70"
          onClick={onSave}
          disabled={isSaving}
        >
          Save
        </button>
      </div>
      {error && (
        <p
          className="m-0 px-[0.9rem] py-2 border-b border-b-[color-mix(in_srgb,var(--color-destructive)_50%,var(--color-border))] text-danger bg-[color-mix(in_srgb,var(--color-destructive)_8%,transparent)] text-xs"
          role="alert"
        >
          {error}
        </p>
      )}
      <EditorHeaderSlot
        context={{ rootPath, relativePath, contents: value, applyEdit: onChange }}
      />
      <div
        className="min-h-0 flex-1 overflow-auto [&_.cm-editor]:min-h-full [&_.cm-editor]:bg-editor [&_.cm-editor]:text-foreground [&_.cm-editor]:font-mono [&_.cm-editor]:text-sm [&_.cm-editor]:leading-[1.65] [&_.cm-scroller]:overflow-auto [&_.cm-content]:pt-4 [&_.cm-content]:px-5 [&_.cm-content]:pb-16 [&_.cm-focused]:outline-none"
        ref={hostRef}
      />
    </section>
  );
}
