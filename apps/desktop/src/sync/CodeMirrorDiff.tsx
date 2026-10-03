/**
 * Two versions of a file, drawn and aligned by CodeMirror's merge surfaces.
 *
 * This component owns none of what the versions mean: the caller supplies both
 * texts, names them, decides whether the working version can be edited, and
 * gets that text back through `onAfterChange`. Diff alignment, collapsing of
 * identical stretches, and the per-chunk controls are all the package's —
 * which is the point: what the working document holds is what the caller
 * saves, and there is no second representation to drift from it.
 *
 * Two presentations share that contract: a side-by-side `MergeView`, and an
 * inline `unifiedMergeView` for containers too narrow to fit two panes. The
 * responsive default follows the container width; once the user picks a
 * layout, resizing never overrides it, and switching engines keeps every edit
 * because the working document is handed across, not re-created.
 */

import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, type LanguageSupport } from "@codemirror/language";
import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { EditorView, highlightSpecialChars, keymap, lineNumbers } from "@codemirror/view";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { codeHighlightStyle, languageForPath } from "../lib/codemirror";
import { DiffLayoutToggle } from "./DiffLayoutToggle";
import { useResponsiveDiffLayout, type DiffLayout } from "./diffLayout";

export interface CodeMirrorDiffProps {
  /** The reference version, never editable. On the left in split mode. */
  readonly before: string;
  /** The working version. On the right in split mode; what `onAfterChange` reports. */
  readonly after: string;
  /** Visible name of the reference version. */
  readonly beforeLabel: string;
  /** Visible name of the working version. */
  readonly afterLabel: string;
  /** Used only to pick a syntax language. */
  readonly relativePath: string;
  /** Whether the working version can be edited. Defaults to true. */
  readonly editableAfter?: boolean;
  /** Show the controls that copy a changed part of `before` into the result. */
  readonly transferBeforeToAfter?: boolean;
  /**
   * Controlled layout. When set, the caller owns the choice — pass
   * `onLayoutChange` so the toggle stays live, and typically
   * `showLayoutToggle={false}` since the caller draws its own.
   */
  readonly layout?: DiffLayout;
  readonly onLayoutChange?: (layout: DiffLayout) => void;
  /** Draw the built-in Inline / Side by side toolbar. Defaults to true. */
  readonly showLayoutToggle?: boolean;
  /**
   * The working pane's editor view, or null on unmount — for callers that
   * need to run commands (undo, redo) on the editable side.
   */
  readonly onWorkingView?: (view: EditorView | null) => void;
  readonly onAfterChange?: (contents: string) => void;
  readonly ariaLabel: string;
}

/** Reconfigurable slots each mounted editor owns — theme and grammar. */
interface PaneChannels {
  readonly theme: Compartment;
  readonly language: Compartment;
}

const readOnly: Extension[] = [
  EditorState.readOnly.of(true),
  EditorView.editable.of(false)
];

const isDark = () => document.documentElement.dataset.thinkbrainTheme === "dark";

const HOST_STYLES =
  "border-b border-border text-editor-foreground [&_.cm-editor]:bg-editor [&_.cm-editor]:font-mono [&_.cm-editor]:text-sm [&_.cm-editor]:leading-1.65 [&_.cm-focused]:outline-none";

/**
 * The unified mode's per-chunk controls, named for what a person picks
 * rather than the package's git-flavored verbs: "reject" puts the incoming
 * text back, "accept" keeps the current result.
 */
const renderUnifiedControl = (
  type: "reject" | "accept",
  action: (e: MouseEvent) => void
): HTMLElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "rounded-small border border-border bg-surface px-1.5 py-0.5 text-[0.7rem] text-foreground cursor-pointer hover:bg-accent";
  button.textContent = type === "reject" ? "Use incoming" : "Keep current";
  button.setAttribute("aria-label", button.textContent);
  // The package's own controls act on mousedown so the click never pulls
  // focus out of the editor mid-selection.
  button.onmousedown = action;
  return button;
};

/**
 * One merge engine mounted for the life of a layout.
 *
 * The props are treated as fixed once mounted — a caller that wants a fresh
 * comparison mounts a fresh component (by `key`), rather than this view
 * trying to swap documents underneath the user's edits. The one exception is
 * the layout itself: switching inline/split re-mounts the engine but hands
 * the live working document across, so edits survive the exchange.
 */
export function CodeMirrorDiff({
  before,
  after,
  beforeLabel,
  afterLabel,
  relativePath,
  editableAfter = true,
  transferBeforeToAfter = false,
  layout: controlledLayout,
  onLayoutChange,
  showLayoutToggle = true,
  onWorkingView,
  onAfterChange,
  ariaLabel
}: CodeMirrorDiffProps): ReactNode {
  const containerRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const onAfterChangeRef = useRef(onAfterChange);
  const onWorkingViewRef = useRef(onWorkingView);
  // The working document outlives any one engine: `after` only seeds it once,
  // and every mounted editor hands its live text back before it is destroyed.
  const workingAfterRef = useRef(after);

  const [layoutOverride, setLayoutOverride] = useState<DiffLayout | null>(null);
  const responsiveLayout = useResponsiveDiffLayout(containerRef);
  const layout = controlledLayout ?? layoutOverride ?? responsiveLayout;
  const chooseLayout = (next: DiffLayout) => {
    if (controlledLayout !== undefined) onLayoutChange?.(next);
    else setLayoutOverride(next);
  };

  useEffect(() => {
    onAfterChangeRef.current = onAfterChange;
    onWorkingViewRef.current = onWorkingView;
  }, [onAfterChange, onWorkingView]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      console.error("[CodeMirrorDiff] host element missing; cannot mount the comparison.");
      return;
    }

    // A facet extension instance is created per reconfigure, so each editor
    // needs its own compartments — a shared one would reconfigure whichever
    // state it happened to be installed in last.
    const channels: Record<"a" | "b", PaneChannels> = {
      a: { theme: new Compartment(), language: new Compartment() },
      b: { theme: new Compartment(), language: new Compartment() }
    };
    const base = (pane: PaneChannels): Extension[] => [
      lineNumbers(),
      highlightSpecialChars(),
      EditorView.lineWrapping,
      // App token styling; CodeMirror's defaults fill any gaps.
      syntaxHighlighting(codeHighlightStyle, { fallback: true }),
      // The merge surface picks lighter/darker change marks from this flag.
      pane.theme.of(EditorView.darkTheme.of(isDark())),
      // Empty until the language loads below.
      pane.language.of([])
    ];
    // The working pane is a real editor: undo history and the ordinary
    // editing keys, and every change is both recorded and reported.
    const editingKeys: Extension[] = [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap])
    ];
    const trackResult = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        workingAfterRef.current = update.state.doc.toString();
        onAfterChangeRef.current?.(workingAfterRef.current);
      }
    });
    const namePane = (label: string, canEdit: boolean): Extension[] => [
      EditorView.contentAttributes.of({
        "aria-label": canEdit ? `${label} (editable)` : label
      })
    ];

    const editors: { view: EditorView; channels: PaneChannels }[] = [];
    let readResult: () => string;
    let destroy: () => void;

    if (layout === "split") {
      const view = new MergeView({
        parent: host,
        orientation: "a-b",
        collapseUnchanged: { margin: 3, minSize: 4 },
        ...(transferBeforeToAfter
          ? {
              revertControls: "a-to-b" as const,
              // Same arrow the package draws, named for what it does here:
              // "revert" means nothing to someone who has never used git.
              renderRevertControl: () => {
                const button = document.createElement("button");
                const text = `Use this part of the ${beforeLabel} version`;
                button.setAttribute("aria-label", text);
                button.setAttribute("title", text);
                button.textContent = "⇝";
                return button;
              }
            }
          : {}),
        a: {
          doc: before,
          extensions: [...base(channels.a), ...readOnly, ...namePane(beforeLabel, false)]
        },
        b: {
          doc: workingAfterRef.current,
          extensions: [
            ...editingKeys,
            ...base(channels.b),
            ...(editableAfter ? [] : readOnly),
            ...namePane(afterLabel, editableAfter),
            trackResult
          ]
        }
      });
      editors.push(
        { view: view.a, channels: channels.a },
        { view: view.b, channels: channels.b }
      );
      readResult = () => view.b.state.doc.toString();
      destroy = () => view.destroy();
      onWorkingViewRef.current?.(view.b);
    } else {
      const view = new EditorView({
        parent: host,
        doc: workingAfterRef.current,
        extensions: [
          ...editingKeys,
          ...base(channels.b),
          ...(editableAfter ? [] : readOnly),
          unifiedMergeView({
            original: before,
            allowInlineDiffs: true,
            collapseUnchanged: { margin: 3, minSize: 4 },
            mergeControls:
              editableAfter && transferBeforeToAfter ? renderUnifiedControl : false
          }),
          ...namePane(afterLabel, editableAfter),
          trackResult
        ]
      });
      editors.push({ view, channels: channels.b });
      readResult = () => view.state.doc.toString();
      destroy = () => view.destroy();
      onWorkingViewRef.current?.(view);
    }

    // The theme flag is only read again through a reconfigure, so an app
    // theme switch after mount would leave an open comparison on the old
    // scheme. Watch the attribute the theme provider flips.
    const themeObserver = new MutationObserver(() => {
      const dark = EditorView.darkTheme.of(isDark());
      for (const { view, channels } of editors) {
        view.dispatch({ effects: channels.theme.reconfigure(dark) });
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-thinkbrain-theme"]
    });

    // Load the language after mount so the comparison is interactive
    // immediately; every live editor shares the file's grammar.
    const language = languageForPath(relativePath);
    let mounted = true;
    if (language) {
      language
        .load()
        .then((support: LanguageSupport) => {
          if (!mounted) return;
          for (const { view, channels } of editors) {
            view.dispatch({ effects: channels.language.reconfigure(support) });
          }
        })
        .catch((cause: unknown) => {
          console.warn(`[CodeMirrorDiff] Failed to load language for ${relativePath}:`, cause);
        });
    }

    return () => {
      themeObserver.disconnect();
      mounted = false;
      // Capture the live result before the engine goes — the next layout
      // mounts from this, never from the `after` prop again.
      workingAfterRef.current = readResult();
      onWorkingViewRef.current?.(null);
      destroy();
    };
    // `after` is deliberately absent: it only seeds workingAfterRef once.
    // `layout` is present precisely because switching engines is the point.
  }, [layout, before, beforeLabel, afterLabel, editableAfter, relativePath, transferBeforeToAfter]);

  return (
    <section
      ref={containerRef}
      className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-hidden"
      aria-label={ariaLabel}
    >
      {/* The layout switch is the same toolbar in both presentations; the
          responsive default only applies until the user picks one. Callers
          that draw their own toggle hide this one. */}
      {showLayoutToggle && (
        <div className="flex min-w-0 items-center justify-end gap-2 border-b border-border bg-card px-2 py-1 text-xs">
          <DiffLayoutToggle layout={layout} onLayoutChange={chooseLayout} />
        </div>
      )}

      {/* Two panes need real width: below the minimum the split comparison
          scrolls sideways inside its own port rather than pushing the page
          wide. Inline never asks for a minimum. */}
      <div className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-x-auto">
        {layout === "split" ? (
          <div className="flex min-h-full w-full min-w-144 flex-col">
            <div className="flex items-stretch border-b border-border bg-card text-xs">
              <p className="m-0 min-w-0 flex-1 truncate px-3 py-1.5 font-semibold text-card-foreground">
                {beforeLabel}
              </p>
              {/* Matches the 1.6em arrow strip the merge view inserts between
                  the editors, so each name sits over its own pane. */}
              {transferBeforeToAfter ? <span aria-hidden="true" className="w-[1.6em] shrink-0" /> : null}
              <p className="m-0 min-w-0 flex-1 truncate px-3 py-1.5 font-semibold text-card-foreground">
                {afterLabel}
              </p>
            </div>
            <div
              ref={hostRef}
              className={`min-h-0 flex-1 ${HOST_STYLES} [&_.cm-mergeView]:h-full`}
            />
          </div>
        ) : (
          <div ref={hostRef} className={`h-full w-full min-w-0 ${HOST_STYLES} [&_.cm-editor]:h-full`} />
        )}
      </div>
    </section>
  );
}
