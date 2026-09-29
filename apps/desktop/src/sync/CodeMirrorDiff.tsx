/**
 * Two versions of a file side by side, drawn and aligned by CodeMirror's
 * merge view.
 *
 * This component owns none of what the panes mean: the caller supplies both
 * texts, names them, decides whether the right pane can be edited, and gets
 * that pane's text back through `onAfterChange`. Diff alignment, collapsing
 * of identical stretches and the transfer arrows between the panes are all
 * the package's — which is the point: what the right pane holds is what the
 * caller saves, and there is no second representation to drift from it.
 */

import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, type LanguageSupport } from "@codemirror/language";
import { MergeView } from "@codemirror/merge";
import { EditorView, highlightSpecialChars, keymap, lineNumbers } from "@codemirror/view";
import { useEffect, useRef, type ReactNode } from "react";

import { codeHighlightStyle, languageForPath } from "../lib/codemirror";

export interface CodeMirrorDiffProps {
  /** The reference version, always read-only. Shown on the left. */
  readonly before: string;
  /** The working version. Shown on the right; what `onAfterChange` reports. */
  readonly after: string;
  /** Visible name over the left pane. */
  readonly beforeLabel: string;
  /** Visible name over the right pane. */
  readonly afterLabel: string;
  /** Used only to pick a syntax language. */
  readonly relativePath: string;
  /** Whether the right pane can be edited. Defaults to true. */
  readonly editableAfter?: boolean;
  /** Show the arrows that copy a changed part of `before` into `after`. */
  readonly transferBeforeToAfter?: boolean;
  readonly onAfterChange?: (contents: string) => void;
  readonly ariaLabel: string;
}

/**
 * One {@link MergeView} mounted for the life of the component.
 *
 * The props are treated as fixed once mounted — a caller that wants a fresh
 * comparison mounts a fresh component (by `key`), rather than this view
 * trying to swap documents underneath the user's edits.
 */
export function CodeMirrorDiff({
  before,
  after,
  beforeLabel,
  afterLabel,
  relativePath,
  editableAfter = true,
  transferBeforeToAfter = false,
  onAfterChange,
  ariaLabel
}: CodeMirrorDiffProps): ReactNode {
  const hostRef = useRef<HTMLDivElement>(null);
  const onAfterChangeRef = useRef(onAfterChange);

  useEffect(() => {
    onAfterChangeRef.current = onAfterChange;
  }, [onAfterChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      console.error("[CodeMirrorDiff] host element missing; cannot mount the comparison.");
      return;
    }

    const languageA = new Compartment();
    const languageB = new Compartment();
    // One compartment per pane: a facet extension instance is created per
    // reconfigure, and a shared compartment would reconfigure whichever pane
    // it happened to be in last.
    const themeA = new Compartment();
    const themeB = new Compartment();
    const isDark = () => document.documentElement.dataset.thinkbrainTheme === "dark";
    const readOnly: Extension[] = [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false)
    ];
    const shared: Extension[] = [
      lineNumbers(),
      highlightSpecialChars(),
      EditorView.lineWrapping,
      // App token styling; CodeMirror's defaults fill any gaps.
      syntaxHighlighting(codeHighlightStyle, { fallback: true })
    ];

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
        extensions: [
          ...shared,
          ...readOnly,
          languageA.of([]),
          // The merge view picks lighter/darker change marks from this flag.
          themeA.of(EditorView.darkTheme.of(isDark())),
          EditorView.contentAttributes.of({ "aria-label": beforeLabel })
        ]
      },
      b: {
        doc: after,
        extensions: [
          // The working pane is a real editor: undo history and the ordinary
          // editing keys, not just a text box.
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          ...shared,
          ...(editableAfter ? [] : readOnly),
          languageB.of([]),
          themeB.of(EditorView.darkTheme.of(isDark())),
          EditorView.contentAttributes.of({
            "aria-label": editableAfter ? `${afterLabel} (editable)` : afterLabel
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onAfterChangeRef.current?.(update.state.doc.toString());
          })
        ]
      }
    });

    // The theme flag is only read again through a reconfigure, so an app
    // theme switch after mount would leave an open comparison on the old
    // scheme. Watch the attribute the theme provider flips.
    const themeObserver = new MutationObserver(() => {
      const dark = isDark();
      view.a.dispatch({ effects: themeA.reconfigure(EditorView.darkTheme.of(dark)) });
      view.b.dispatch({ effects: themeB.reconfigure(EditorView.darkTheme.of(dark)) });
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-thinkbrain-theme"]
    });

    // Load the language after mount so the comparison is interactive
    // immediately; both panes share the file's grammar.
    const language = languageForPath(relativePath);
    let mounted = true;
    if (language) {
      language
        .load()
        .then((support: LanguageSupport) => {
          if (!mounted) return;
          view.a.dispatch({ effects: languageA.reconfigure(support) });
          view.b.dispatch({ effects: languageB.reconfigure(support) });
        })
        .catch((cause: unknown) => {
          console.warn(`[CodeMirrorDiff] Failed to load language for ${relativePath}:`, cause);
        });
    }

    return () => {
      themeObserver.disconnect();
      mounted = false;
      view.destroy();
    };
  }, [after, afterLabel, before, beforeLabel, editableAfter, relativePath, transferBeforeToAfter]);

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={ariaLabel}>
      {/* Two panes need real width. Below the minimum the whole comparison
          scrolls sideways rather than crushing either side into slivers. */}
      <div className="min-h-0 flex-1 overflow-x-auto">
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
            className="min-h-0 flex-1 border-b border-border text-editor-foreground [&_.cm-editor]:bg-editor [&_.cm-editor]:font-mono [&_.cm-editor]:text-sm [&_.cm-editor]:leading-1.65 [&_.cm-focused]:outline-none [&_.cm-mergeView]:h-full"
          />
        </div>
      </div>
    </section>
  );
}
