import type { EditorView } from "@codemirror/view";
import { CircleHelp } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Unavailable } from "../shell/Unavailable";
import {
  cmHistoryCommands,
  notifyEditorCommands,
  registerEditorCommands
} from "../tabs/editorCommands";
import { CodeMirrorDiff } from "./CodeMirrorDiff";
import { DiffLayoutToggle } from "./DiffLayoutToggle";
import { useResponsiveDiffLayout, type DiffLayout } from "./diffLayout";
import { describeSize, describeWhen, noteName } from "./conflictCard";
import { readConflict, resolveConflict } from "./conflictService";
import type { ConflictComparison, ConflictResolution } from "./conflictTypes";
import { failureMessage } from "./syncCopy";

/**
 * Two versions of one note, side by side — and a result that can be edited.
 *
 * The left pane is the incoming version and is read-only. The right pane
 * starts as this computer's version and is what "Save merged note" writes,
 * whether it was changed by the arrows between the panes or edited directly.
 * CodeMirror aligns and renders the two; the native side still owns the
 * safety contract — fingerprints, checkpoints and the write itself — through
 * `resolveConflict`, exactly as the whole-file actions use it.
 */

interface MergeTabProps {
  readonly rootPath: string | null;
  /** The conflict copy this tab is about. */
  readonly copyPath: string | null;
  /**
   * This tab's id — the key its undo/redo and Save commands register under
   * so the header bar can reach the result pane. `null` outside the shell;
   * required so a caller cannot forget it and silently lose merge Save.
   */
  readonly tabId: string | null;
  /**
   * Unsaved text from an editor open on this note, if there is one.
   *
   * "This computer's version" has to be what the user is looking at. Comparing
   * against the last save would offer them a version of their own note that
   * they can see is out of date.
   */
  readonly buffer?: string | null;
}
type Phase =
  | { readonly at: "loading" }
  | { readonly at: "ready"; readonly conflict: ConflictComparison }
  | { readonly at: "done"; readonly note: string; readonly keptAs: string | null }
  | { readonly at: "failed"; readonly message: string };

const COMPARE_FAILURE = "Something went wrong reading the two versions.";

/**
 * Starts a fresh session per conflict.
 *
 * The key is what resets the result when the tab is pointed at a different
 * conflict, rather than an effect that clears it — and it is why the session
 * below never has to put itself back into a loading state.
 */
export function MergeTab({ rootPath, copyPath, tabId, buffer }: MergeTabProps) {
  if (!rootPath || !copyPath) {
    return <Unavailable title="Nothing to compare" description="This tab has lost track of which note it was about." />;
  }
  return (
    <MergeSession key={`${rootPath}:${copyPath}`} rootPath={rootPath} copyPath={copyPath} tabId={tabId} buffer={buffer} />
  );
}

interface MergeSessionProps {
  readonly rootPath: string;
  readonly copyPath: string;
  readonly tabId: string | null;
  readonly buffer?: string | null;
}

function MergeSession({ rootPath, copyPath, tabId, buffer }: MergeSessionProps) {
  const [phase, setPhase] = useState<Phase>({ at: "loading" });
  const [resolving, setResolving] = useState(false);

  // Taken once, when the comparison is opened. The editor's text changes with
  // every keystroke, and re-reading on each one would throw away the result
  // already edited — "this computer's version" means the one on screen when
  // the user came to compare, not a moving target.
  const openedWith = useRef(buffer);

  useEffect(() => {
    let cancelled = false;
    void readConflict(rootPath, copyPath, openedWith.current)
      .then((conflict) => {
        if (!cancelled) setPhase({ at: "ready", conflict });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setPhase({ at: "failed", message: failureMessage(cause, COMPARE_FAILURE) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [copyPath, rootPath]);

  const resolve = useCallback(
    async (resolution: ConflictResolution) => {
      if (phase.at !== "ready") return;
      setResolving(true);
      try {
        const done = await resolveConflict(rootPath, phase.conflict, resolution);
        setPhase({ at: "done", note: done.note, keptAs: done.keptAs });
      } catch (cause) {
        setPhase({ at: "failed", message: failureMessage(cause, COMPARE_FAILURE) });
      } finally {
        setResolving(false);
      }
    },
    [phase, rootPath]
  );

  if (phase.at === "loading") {
    return <Unavailable title="Opening both versions" description="Reading what each device has." />;
  }
  if (phase.at === "failed") {
    return <Unavailable title="Could not compare these versions" description={phase.message} />;
  }
  if (phase.at === "done") {
    return (
      <Unavailable
        title="Saved"
        description={
          phase.keptAs
            ? `Both versions were kept — the other one is now "${phase.keptAs}". You can always undo: earlier versions are kept in Version history.`
            : "You can always undo — the earlier versions of this note are kept in Version history."
        }
      />
    );
  }

  return (
    <MergeSurface conflict={phase.conflict} resolving={resolving} onResolve={resolve} tabId={tabId} />
  );
}

interface MergeSurfaceProps {
  readonly conflict: ConflictComparison;
  readonly resolving: boolean;
  readonly onResolve: (resolution: ConflictResolution) => void;
  readonly tabId: string | null;
}

const ACTION_BUTTON =
  "cursor-pointer rounded-small border border-border bg-surface px-3 py-1 text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50";
const WHOLE_VERSION_CHOICES = [
  { kind: "keepOurs", label: "Keep current" },
  { kind: "keepTheirs", label: "Use incoming" },
  { kind: "keepBoth", label: "Keep both files" }
] as const;

function MergeSurface({ conflict, resolving, onResolve, tabId }: MergeSurfaceProps) {
  const { ours, theirs } = conflict;
  // `text` is checked, not just `kind`: the type promises they agree, but a
  // stale native build once sent a shape that broke the promise — and the
  // whole app paid for trusting it with a white screen.
  const comparable = conflict.kind === "text" && conflict.text !== null;
  const note = noteName(ours.path);

  // Whatever the right pane currently holds — moved by the transfer arrows,
  // typed, or untouched. Sent verbatim as the merged note on save. It seeds
  // from this computer's complete version, exactly as the comparison sent it,
  // and lives in a ref so the registered save never reads stale text.
  const resultRef = useRef(comparable ? conflict.text.current : "");
  const resolvingRef = useRef(resolving);
  const onResolveRef = useRef(onResolve);
  const workingViewRef = useRef<EditorView | null>(null);

  const sectionRef = useRef<HTMLElement>(null);
  const responsiveLayout = useResponsiveDiffLayout(sectionRef);
  const [layoutOverride, setLayoutOverride] = useState<DiffLayout | null>(null);
  const layout = layoutOverride ?? responsiveLayout;

  // The "why am I looking at this" sentence lives behind a click so it costs
  // no screen space — title-text would be invisible on touch, and a fixed
  // line under the bar is room the panes could have.
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!helpOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!helpRef.current?.contains(event.target as Node)) setHelpOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHelpOpen(false);
    };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [helpOpen]);

  const helpId = useId();

  useEffect(() => {
    onResolveRef.current = onResolve;
    resolvingRef.current = resolving;
    // The header's Save enabled-state follows `canSave`, which reads this —
    // let it know the answer changed.
    if (tabId) notifyEditorCommands(tabId);
  }, [onResolve, resolving, tabId]);

  // The result pane is the only editable surface here, so it is what the
  // header's undo/redo and Save act on — Save resolves the conflict with
  // whatever the pane currently holds. A non-text conflict has no pane and
  // no merge to save, so it registers nothing.
  useEffect(() => {
    if (!tabId || !comparable) return;
    return registerEditorCommands(tabId, {
      // The diff mounts its working view after this registers — the thunk
      // keeps the commands pointed at the live pane.
      ...cmHistoryCommands(() => workingViewRef.current),
      save: () => {
        if (!resolvingRef.current) {
          onResolveRef.current({ kind: "merged", contents: resultRef.current });
        }
      },
      canSave: () => !resolvingRef.current,
      saveLabel: "Save merged note"
    });
  }, [tabId, comparable]);

  return (
    <section
      ref={sectionRef}
      className="@container flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden"
      aria-label={`Compare versions of ${note}`}
    >
      {/* Second header bar, cut from the same cloth as the breadcrumb bar
          above it: same background, height and padding. Whole-version choices
          left; the layout toggle and the why-you're-here help right. */}
      <div className="flex min-h-8 flex-none flex-wrap items-center gap-2 border-b border-border bg-editor px-[0.9rem] py-1">
        {WHOLE_VERSION_CHOICES.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            className={ACTION_BUTTON}
            disabled={resolving}
            onClick={() => onResolve({ kind })}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {comparable && (
            <DiffLayoutToggle layout={layout} onLayoutChange={setLayoutOverride} />
          )}
          <div ref={helpRef} className="relative">
            <button
              type="button"
              className="cursor-pointer rounded-small px-1 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="About this comparison"
              aria-expanded={helpOpen}
              aria-controls={helpId}
              title="About this comparison"
              onClick={() => setHelpOpen((open) => !open)}
            >
              <CircleHelp className="size-3.5" aria-hidden="true" />
            </button>
            {helpOpen && (
              <div
                id={helpId}
                role="note"
                className="absolute right-0 top-full z-50 mt-1 w-72 rounded-small border border-border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-soft"
              >
                <p className="m-0">
                  Two versions of this note exist — &ldquo;{note}&rdquo; was edited on
                  another device before this one finished syncing.
                  {comparable
                    ? " Use the arrows between the panes to bring parts across, edit the result however you need, then save it."
                    : " This file can't be compared line by line, so choose which version to keep."}
                </p>
                <p className="mb-0 mt-2 text-muted-foreground">
                  {theirs.label} · {describeSize(theirs.byteSize)} · {describeWhen(theirs.changedAt)}
                  <br />
                  {ours.label} · {describeSize(ours.byteSize)} · {describeWhen(ours.changedAt)}
                </p>
                <p className="mb-0 mt-2 text-muted-foreground">
                  Whichever you choose, the earlier versions stay in Version history.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {comparable ? (
        // A floor keeps the diff usable on a very short screen — the
        // section scrolls instead of the comparison collapsing away.
        <div className="flex min-h-56 min-w-0 max-w-full flex-1 flex-col overflow-hidden">
          <CodeMirrorDiff
            before={conflict.text.incoming}
            after={conflict.text.current}
            beforeLabel={theirs.label}
            afterLabel={`${ours.label} — what will be saved`}
            relativePath={ours.path}
            editableAfter
            transferBeforeToAfter
            layout={layout}
            onLayoutChange={setLayoutOverride}
            showLayoutToggle={false}
            onWorkingView={(view) => {
              workingViewRef.current = view;
              if (tabId) notifyEditorCommands(tabId);
            }}
            onAfterChange={(contents) => {
              resultRef.current = contents;
              if (tabId) notifyEditorCommands(tabId);
            }}
            ariaLabel={`Side-by-side comparison of the two versions of ${note}`}
          />
        </div>
      ) : (
        <p className="m-0 flex-1 rounded-small border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
          This file can&apos;t be compared piece by piece — its contents aren&apos;t text. Choose a
          whole version above; the one you don&apos;t pick can still be kept as a separate file.
        </p>
      )}
    </section>
  );
}
