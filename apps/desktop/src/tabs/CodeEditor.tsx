import { Compartment, EditorState, StateEffect } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";

import { codeHighlightStyle, languageForPath } from "../lib/codemirror";
import { cmHistoryCommands, notifyEditorCommands, registerEditorCommands } from "./editorCommands";
import { recallEditorState, rememberEditorState } from "./editorStateCache";

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

/** Minimal diff to avoid resetting cursor on external value updates. */
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
  while (endCurrent > start && endNext > start && current[endCurrent - 1] === next[endNext - 1]) {
    endCurrent -= 1;
    endNext -= 1;
  }
  return { from: start, to: endCurrent, insert: next.slice(start, endNext) };
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
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const [languageCompartment] = useState(() => new Compartment());

  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
  }, [onChange, onSave]);

  useEffect(() => {
    if (!hostRef.current) {
      console.error("[CodeEditor] host element missing; cannot mount CodeMirror.");
      return;
    }

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
          onChangeRef.current(update.state.doc.toString());
          if (stateKey !== undefined) notifyEditorCommands(stateKey);
        }
      }),
      // Cmd/Ctrl+S triggers save instead of the browser default.
      keymap.of([{
        key: "Mod-s",
        preventDefault: true,
        run: () => { onSaveRef.current(); return true; }
      }])
    ];

    // Load language extension lazily based on file extension.
    const langDesc = relativePath ? languageForPath(relativePath) : undefined;
    const initialLanguage = languageCompartment.of([]);

    const parked = stateKey === undefined ? undefined : recallEditorState(stateKey);

    const view = new EditorView({
      parent: hostRef.current,
      state:
        parked?.state ??
        EditorState.create({
          doc: valueRef.current,
          extensions: [...baseExtensions, initialLanguage]
        })
    });
    viewRef.current = view;

    // Undo/redo buttons in the header act on this view, keyed by the tab id
    // the shell passed as `stateKey`.
    const unregisterCommands =
      stateKey === undefined
        ? undefined
        : registerEditorCommands(stateKey, cmHistoryCommands(() => view));

    if (parked) {
      view.dispatch({ effects: StateEffect.reconfigure.of([...baseExtensions, initialLanguage]) });
      view.scrollDOM.scrollTop = parked.scrollTop;
    }

    // Load the language async after mount so the editor is interactive immediately.
    if (langDesc) {
      langDesc.load().then((languageSupport) => {
        if (viewRef.current !== view) return; // unmounted or retargeted
        view.dispatch({
          effects: languageCompartment.reconfigure(languageSupport)
        });
      }).catch((err) => {
        console.warn(`[CodeEditor] Failed to load language for ${relativePath}:`, err);
      });
    }

    return () => {
      unregisterCommands?.();
      if (stateKey !== undefined) {
        rememberEditorState(stateKey, {
          state: view.state,
          scrollTop: view.scrollDOM.scrollTop
        });
      }
      view.destroy();
      viewRef.current = null;
    };
  }, [languageCompartment, stateKey, relativePath]);

  // External value updates (e.g. file reloaded from disk).
  useEffect(() => {
    valueRef.current = value;
    const view = viewRef.current;
    if (!view) return;
    const change = minimalChange(view.state.doc.toString(), value);
    if (change) view.dispatch({ changes: change });
  }, [value]);

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-busy={isSaving} aria-label="Code editor">
      {error && (
        <p
          className="m-0 px-[0.9rem] py-2 border-b border-b-[color-mix(in_srgb,var(--color-destructive)_50%,var(--color-border))] text-danger bg-[color-mix(in_srgb,var(--color-destructive)_8%,transparent)] text-xs"
          role="alert"
        >
          {error}
        </p>
      )}
      <div
        className="tn-cm-editor min-h-0 flex-1 overflow-auto cursor-text"
        ref={hostRef}
        onPointerDown={(event) => {
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
