import { Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers } from "@codemirror/view";
import { useCallback, useState } from "react";

import { codeHighlightStyle, languageForPath } from "../lib/codemirror";
import { notifyEditorCommands } from "./editorCommands";
import { EditorErrorBanner } from "./EditorErrorBanner";
import {
  useCodeMirrorView,
  type CodeMirrorCallbacks,
  type MountedEditorView
} from "./useCodeMirrorView";

export interface CodeEditorProps {
  readonly value: string;
  readonly isSaving?: boolean;
  readonly error?: string | null;
  readonly rootPath?: string | null;
  readonly relativePath?: string | null;
  readonly stateKey?: string;
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
}

/**
 * CodeMirror 6 editor for non-Markdown text files (code, config, plain text).
 *
 * Language support is loaded lazily via `@codemirror/language-data` — only the
 * language for the open file is fetched, keeping the initial bundle small.
 * State (cursor, scroll, undo history) is cached across tab switches via
 * `editorStateCache`, same as the Markdown editor.
 */
export function CodeEditor({
  value,
  isSaving = false,
  error,
  relativePath = null,
  stateKey,
  onChange,
  onSave
}: CodeEditorProps) {
  const [languageCompartment] = useState(() => new Compartment());

  const buildView = useCallback(
    (callbacks: CodeMirrorCallbacks): MountedEditorView => {
      const baseExtensions = [
        lineNumbers(),
        foldGutter(),
        history(),
        indentOnInput(),
        bracketMatching(),
        highlightSpecialChars(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        // Use the app's token-based highlight style, falling back to CodeMirror's
        // defaults for any tags not explicitly covered.
        syntaxHighlighting(codeHighlightStyle, { fallback: true }),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            callbacks.onChange(update.state.doc.toString());
            if (stateKey !== undefined) notifyEditorCommands(stateKey);
          }
        }),
        // Cmd/Ctrl+S triggers save instead of the browser default.
        keymap.of([{
          key: "Mod-s",
          preventDefault: true,
          run: () => { callbacks.onSave(); return true; }
        }])
      ];

      // Load language extension lazily based on file extension.
      const langDesc = relativePath ? languageForPath(relativePath) : undefined;
      const initialLanguage = languageCompartment.of([]);

      return {
        extensions: [...baseExtensions, initialLanguage],
        // Load the language async after mount so the editor is interactive immediately.
        afterMount: langDesc
          ? (view, viewRef) => {
              langDesc.load().then((languageSupport) => {
                if (viewRef.current !== view) return; // unmounted or retargeted
                view.dispatch({
                  effects: languageCompartment.reconfigure(languageSupport)
                });
              }).catch((err) => {
                console.warn(`[CodeEditor] Failed to load language for ${relativePath}:`, err);
              });
            }
          : undefined
      };
    },
    [languageCompartment, relativePath, stateKey]
  );

  const { hostRef, onHostPointerDown } = useCodeMirrorView({
    value,
    stateKey,
    label: "[CodeEditor]",
    onChange,
    onSave,
    mount: buildView
  });

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-busy={isSaving} aria-label="Code editor">
      {error && <EditorErrorBanner error={error} />}
      <div
        className="tn-cm-editor min-h-0 flex-1 overflow-auto cursor-text"
        ref={hostRef}
        onPointerDown={onHostPointerDown}
      />
    </section>
  );
}
