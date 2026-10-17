import { EditorState, StateEffect, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from "react";

import { minimalChange } from "../lib/codemirror";
import { useEffectiveValue } from "../settings/useEffectiveValue";
import { useSettingsStore } from "../settings/settingsStore";
import { cmHistoryCommands, registerEditorCommands, type EditorCommands } from "./editorCommands";
import { createEditorDisplayController } from "./editorDisplayController";
import {
  EDITOR_FONT_SIZE_KEY,
  EDITOR_LINE_WRAPPING_KEY,
  resolveEditorFontSize,
  resolveEditorLineWrapping
} from "./editorDisplaySettings";
import {
  notifyEditorMapped,
  registerEditorView,
  unregisterEditorView
} from "./editorLocationRegistry";
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
  // Snapshot taken while the host is still attached — see the layout effect
  // below for why a passive cleanup reads it too late.
  const earlyScrollRef = useRef<ReturnType<EditorView["scrollSnapshot"]> | undefined>(undefined);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  // Editor display preferences live in one per-view controller so a changed
  // preference reconfigures the live view instead of forcing a remount.
  const fontSize = resolveEditorFontSize(useEffectiveValue(EDITOR_FONT_SIZE_KEY));
  const lineWrapping = resolveEditorLineWrapping(useEffectiveValue(EDITOR_LINE_WRAPPING_KEY));
  const [displayCtl] = useState(() =>
    createEditorDisplayController({
      fontSize: resolveEditorFontSize(
        useSettingsStore.getState().getEffectiveValue(EDITOR_FONT_SIZE_KEY)
      ),
      lineWrapping: resolveEditorLineWrapping(
        useSettingsStore.getState().getEffectiveValue(EDITOR_LINE_WRAPPING_KEY)
      )
    })
  );
  // Latest-value mirrors live in effects — never write refs during render.
  // These run before the mount effect below, so the initial values the
  // mount reads are already current.
  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
  }, [onChange, onSave]);

  // A preference change reconfigures the compartment in place and re-lands
  // the same reading position with a scroll snapshot in the same
  // transaction — no remount, no jump. The initial extension already carries
  // the current values, so the first run is a no-op.
  const displayInitRef = useRef(false);
  useEffect(() => {
    if (!displayInitRef.current) {
      displayInitRef.current = true;
      return;
    }
    const view = viewRef.current;
    if (!view) return;
    if (displayCtl.applied().fontSize === fontSize && displayCtl.applied().lineWrapping === lineWrapping) {
      return;
    }
    displayCtl.applyPreferences(view, { fontSize, lineWrapping });
  }, [fontSize, lineWrapping, displayCtl]);

  // A detached `.cm-scroller` reports scrollTop 0, and passive-effect
  // cleanups run after React has removed the DOM — so an unmount would park
  // a snapshot of "scrolled to top". Layout-effect cleanups fire before the
  // host nodes go away, which is the last moment scrollDOM still tells the
  // truth. (Effect re-runs keep the DOM attached; the passive cleanup then
  // snapshots live and clears this.)
  useLayoutEffect(() => {
    return () => {
      earlyScrollRef.current = viewRef.current?.scrollSnapshot();
    };
  }, []);

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

    // The display compartment is appended last so a reconfigure lands on
    // fresh and parked states identically. The location tracker reports every
    // doc-changing transaction so stored history anchors re-anchor through
    // local edits — same for a fresh state as for a rebound parked one.
    const locationTracking =
      stateKey === undefined
        ? []
        : EditorView.updateListener.of((update) => {
            if (update.docChanged) notifyEditorMapped(stateKey, update.changes);
          });
    const extensions = [mounted.extensions, displayCtl.extension(), locationTracking];

    const view = new EditorView({
      parent: host,
      state:
        parked?.state ??
        EditorState.create({
          doc: valueRef.current,
          ...(mounted.selectionAnchor === undefined
            ? {}
            : { selection: { anchor: mounted.selectionAnchor(valueRef.current) } }),
          extensions
        }),
      // The parked snapshot was taken against the same document this state
      // carries, so `scrollTo` restores the exact measured position — raw px
      // would only be correct if the reflow could never move the text.
      ...(parked?.scrollSnapshot === undefined
        ? {}
        : { scrollTo: parked.scrollSnapshot })
    });
    viewRef.current = view;
    // The live-view registry is what lets navigation history capture and
    // restore this editor's position while it is the one on screen.
    if (stateKey !== undefined) registerEditorView(stateKey, view);

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
      view.dispatch({ effects: StateEffect.reconfigure.of(extensions) });
    }

    mounted.afterMount?.(view, viewRef);

    return () => {
      unregisterCommands?.();
      if (stateKey !== undefined) {
        unregisterEditorView(stateKey, view);
        // Scroll position is DOM state rather than editor state, so it has to
        // be taken before the view goes — as a scrollSnapshot, which survives
        // the layout reflow a remount can cause.
        rememberEditorState(stateKey, {
          state: view.state,
          scrollSnapshot: earlyScrollRef.current ?? view.scrollSnapshot()
        });
      }
      // Whether or not this mount parked anything, the early snapshot is only
      // valid for the teardown it was captured in — a stale value must not
      // travel into a later unmount under another key (or no key).
      earlyScrollRef.current = undefined;
      view.destroy();
      viewRef.current = null;
    };
  }, [mount, stateKey, label, displayCtl]);

  // External value updates (e.g. file reloaded from disk, or a whole-note
  // edit like the metadata widget's) merge in as the smallest diff, so the
  // cursor and undo history are left alone.
  useEffect(() => {
    valueRef.current = value;
    const view = viewRef.current;
    if (!view) return;
    const change = minimalChange(view.state.doc.toString(), value);
    if (change) {
      view.dispatch({ changes: change });
    }
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
