import { EditorState } from "@codemirror/state";
import { keymap, EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";

import {
  markdownEditorHookRegistry,
  type MarkdownEditorHookPayload
} from "./markdownEditorHooks";

export interface MarkdownEditorProps {
  readonly value: string;
  readonly isSaving?: boolean;
  readonly error?: string | null;
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
}

/** CodeMirror 6 is isolated behind this controlled, document-value boundary. */
export function MarkdownEditor({
  value,
  isSaving = false,
  error,
  onChange,
  onSave
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
  }, [onChange, onSave]);

  useEffect(() => {
    if (!hostRef.current) {
      console.error("[MarkdownEditor] host element missing; cannot mount CodeMirror.");
      return;
    }

    const payload: MarkdownEditorHookPayload = {
      onChange: (nextValue) => onChangeRef.current(nextValue),
      onSave: () => onSaveRef.current()
    };
    const extensions = markdownEditorHookRegistry.getExtensions(payload, undefined);
    const keybindings = markdownEditorHookRegistry.getKeybindings(payload, undefined);
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [...extensions, keymap.of(keybindings)]
      })
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === view.state.doc.toString()) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

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
      <div
        className="min-h-0 flex-1 overflow-auto [&_.cm-editor]:min-h-full [&_.cm-editor]:bg-editor [&_.cm-editor]:text-foreground [&_.cm-editor]:font-mono [&_.cm-editor]:text-sm [&_.cm-editor]:leading-[1.65] [&_.cm-scroller]:overflow-auto [&_.cm-content]:pt-4 [&_.cm-content]:px-5 [&_.cm-content]:pb-16 [&_.cm-focused]:outline-none"
        ref={hostRef}
      />
    </section>
  );
}
