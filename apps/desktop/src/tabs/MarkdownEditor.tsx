import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";

export interface MarkdownEditorProps {
  readonly value: string;
  readonly isSaving?: boolean;
  readonly error?: string | null;
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
}

/** CodeMirror 6 is isolated behind this controlled, document-value boundary. */
export function MarkdownEditor({ value, isSaving = false, error, onChange, onSave }: MarkdownEditorProps) {
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
    if (!hostRef.current) return;

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          history(),
          markdown(),
          EditorView.lineWrapping,
          // CodeMirror 6 uses two cursor mechanisms: the native caret
          // (caret-color on .cm-content) and a drawn cursor (borderLeftColor
          // on .cm-cursor, shown only when focused). The default drawn cursor
          // is `border-left: 1.2px solid black` — invisible on a dark editor
          // background. This theme extension overrides both, and { dark: true }
          // enables CodeMirror's dark-mode selectors so the &dark rules apply.
          EditorView.theme({
            ".cm-content": { caretColor: "var(--tn-color-foreground)" },
            ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--tn-color-foreground)" },
            "&.cm-focused .cm-cursor": { borderLeftColor: "var(--tn-color-foreground)" }
          }, { dark: true }),
          EditorView.contentAttributes.of({ "aria-label": "Markdown editor" }),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
            {
              key: "Mod-s",
              run: () => {
                onSaveRef.current();
                return true;
              }
            }
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          })
        ]
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
