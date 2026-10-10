import { EditorState, StateEffect, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from "react";

import { minimalChange } from "../lib/codemirror";
import { cmHistoryCommands, registerEditorCommands, type EditorCommands } from "./editorCommands";
import { recallEditorState, rememberEditorState } from "./editorStateCache";

/**
 * Latest-callback wrappers handed to `mount`, so an extension built on the
 * first render still reaches the `onChange`/`onSave` of the current one.
 */
export interface CodeMirrorCallbacks {
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
}

/**
 * What a mounted editor needs beyond the shared shell: its extension set —
 * used both to build a fresh state and to rebind a parked one — and any
 * per-editor mount-time extras.
 */
export interface MountedEditorView {
  readonly extensions: Extension;
  /** Fresh-state selection anchor computed from the initial doc; omitted keeps the default. */
  readonly selectionAnchor?: (doc: string) => number;
  /** Runs at the end of the mount effect (e.g. kicking off an async language load). */
  readonly afterMount?: (
    view: EditorView,
    viewRef: RefObject<EditorView | null>
  ) => void;
  /** Extra commands registered under `stateKey` beyond the shared undo/redo. */
  readonly commands?: (getView: () => EditorView | null) => Partial<EditorCommands>;
}

/**
 * The mount lifecycle every CodeMirror-backed editor in `tabs/` shares:
 * recall parked state for `stateKey`, create the `EditorView`, register the
 * header's undo/redo commands, rebind a parked state to this mount's
 * extensions and restore its scroll — then park state back and destroy on
 * unmount. Also owns the refs, the `value` → `minimalChange` sync and the
 * click-below-end pointer handler.
 *
 * `mount` is called once inside the effect; pass a `useCallback` whose deps
 * are exactly the inputs that should force a remount when they change (the
 * same list the inline effect used to carry).
 */
export function useCodeMirrorView({
  value,
  stateKey,
  label,
  onChange,
  onSave,
  mount
}: {
  readonly value: string;
  /** Identity to park state under while this tab is off screen; undefined parks nothing. */
  readonly stateKey?: string;
  /** Log prefix for the missing-host error, e.g. "[MarkdownEditor]". */
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
  readonly mount: (callbacks: CodeMirrorCallbacks) => MountedEditorView;
}): {
  readonly hostRef: RefObject<HTMLDivElement | null>;
  readonly viewRef: RefObject<EditorView | null>;
  readonly onHostPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
} {
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
    const host = hostRef.current;
    if (!host) {
      console.error(`${label} host element missing; cannot mount CodeMirror.`);
      return;
    }

    const mounted = mount({
      onChange: (nextValue) => onChangeRef.current(nextValue),
      onSave: () => onSaveRef.current()
    });
    const parked = stateKey === undefined ? undefined : recallEditorState(stateKey);

    const view = new EditorView({
      parent: host,
      state:
        parked?.state ??
        EditorState.create({
          doc: valueRef.current,
          ...(mounted.selectionAnchor === undefined
            ? {}
            : { selection: { anchor: mounted.selectionAnchor(valueRef.current) } }),
          extensions: mounted.extensions
        })
    });
    viewRef.current = view;

    // Undo/redo buttons in the header act on this view, keyed by the tab id
    // the shell passed as `stateKey`; `mounted.commands` adds per-editor
    // commands (e.g. Markdown formatting for the phone bar).
    const getView = () => viewRef.current;
    const unregisterCommands =
      stateKey === undefined
        ? undefined
        : registerEditorCommands(stateKey, {
            ...cmHistoryCommands(() => view),
            ...mounted.commands?.(getView)
          });

    if (parked) {
      // The parked state carries the previous mount's extensions, and those
      // close over that mount's callbacks. Swapping the whole configuration
      // rebinds them to this one; the state fields keyed to the same extension
      // instances — the undo history above all — carry across untouched.
      view.dispatch({ effects: StateEffect.reconfigure.of(mounted.extensions) });
      view.scrollDOM.scrollTop = parked.scrollTop;
    }

    mounted.afterMount?.(view, viewRef);

    return () => {
      unregisterCommands?.();
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
  }, [mount, stateKey, label]);

  // External value updates (e.g. file reloaded from disk, or a whole-note
  // edit like the metadata widget's) merge in as the smallest diff, so the
  // cursor and undo history are left alone.
  useEffect(() => {
    valueRef.current = value;
    const view = viewRef.current;
    if (!view) return;
    const change = minimalChange(view.state.doc.toString(), value);
    if (change) view.dispatch({ changes: change });
  }, [value]);

  const onHostPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const view = viewRef.current;
    if (!view) return;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    // Only intercept clicks that land at or past the end of the document
    // (i.e. below the last line of text). Clicks within the document are
    // left to CodeMirror's native handling so selection, double-click,
    // and drag all work normally.
    if (pos === null || pos < view.state.doc.length) return;
    event.preventDefault();
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    view.focus();
  }, []);

  return { hostRef, viewRef, onHostPointerDown };
}
