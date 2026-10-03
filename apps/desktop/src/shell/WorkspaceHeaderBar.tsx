import { useEffect, useState, type ReactNode } from "react";
import { Folder, FolderGit2, Redo2, Undo2 } from "lucide-react";
import { restoreBreadcrumbSegments, type DesktopTab } from "../tabs/tabModel";
import { useEditorCommands } from "../tabs/editorCommands";
import { isWorkspaceGitLinked } from "../workspace/workspaceSettings";
import { cn } from "../lib/utils";

export interface WorkspaceHeaderBarProps {
  /** Display name of the active workspace, or null if none. */
  readonly workspaceName?: string | null;
  /** Root filesystem path of the workspace, used to resolve Git link status. */
  readonly rootPath?: string | null;
  /** Currently active tab, or null if no tab is open. */
  readonly activeTab?: DesktopTab | null;
  /** Whether the active tab has unsaved modifications. */
  readonly isDirty?: boolean;
  /** Whether a save operation is currently in-flight. */
  readonly isSaving?: boolean;
  /** Callback to trigger saving the active note. */
  readonly onSave?: () => void;
  /** Optional extra action buttons to render in the header bar. */
  readonly children?: ReactNode;
}

const IS_APPLE = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.platform || "");
const SAVE_SHORTCUT = IS_APPLE ? "⌘S" : "Ctrl+S";

/**
 * Consolidated header bar below editor tabs showing note folder path and actions.
 */
export function WorkspaceHeaderBar({
  workspaceName,
  rootPath,
  activeTab,
  isDirty = false,
  isSaving = false,
  onSave,
  children
}: WorkspaceHeaderBarProps) {
  const [isGitLinked, setIsGitLinked] = useState(false);
  // Whatever the active tab's editable surface offers — undo/redo on its
  // CodeMirror view for editors, and on merge tabs a Save that resolves the
  // conflict rather than saving a document.
  const commands = useEditorCommands(activeTab?.id);

  useEffect(() => {
    if (!rootPath) return;
    let cancelled = false;
    isWorkspaceGitLinked(rootPath)
      .then((linked) => {
        if (!cancelled) setIsGitLinked(linked);
      })
      .catch(() => {
        if (!cancelled) setIsGitLinked(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  const isLinked = Boolean(rootPath && isGitLinked);

  // A restore preview is an operation on the file, not the file itself:
  // "Vault › Restore › folder › note.md" rather than masquerading as the path.
  const restoreSegments = restoreBreadcrumbSegments(activeTab);
  const pathSegments =
    restoreSegments ??
    (activeTab?.resource?.relativePath
      ? activeTab.resource.relativePath.split("/").filter(Boolean)
      : activeTab ? [activeTab.title] : []);

  return (
    <div
      className="flex min-h-8 flex-none items-center justify-between gap-3 border-b border-border bg-editor px-[0.9rem] py-1 text-muted-foreground text-[0.72rem]"
      data-testid="workspace-header-bar"
    >
      <div className="flex min-w-0 items-center truncate">
        <span className="flex items-center gap-1.5 truncate">
          {isLinked ? (
            <FolderGit2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <Folder className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="truncate">{workspaceName ?? "Workspace"}</span>
        </span>
        {pathSegments.map((segment, index) => (
          <span key={index} className="flex items-center truncate">
            <span className="px-[0.28rem] text-muted-foreground/60 select-none">›</span>
            <span className="truncate">{segment}</span>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {children}
        {commands && (
          <>
            <button
              type="button"
              disabled={!commands.canUndo()}
              onClick={commands.undo}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              className="rounded-small border border-border/40 px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              <Undo2 className="size-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={!commands.canRedo()}
              onClick={commands.redo}
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
              className="rounded-small border border-border/40 px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              <Redo2 className="size-3.5" aria-hidden="true" />
            </button>
          </>
        )}
        {(activeTab?.kind === "editor" || activeTab?.kind === "code-editor" || commands?.save) && (
          (() => {
            const saveEnabled = commands?.save
              ? (commands.canSave?.() ?? true)
              : isDirty;
            return (
              <button
                type="button"
                disabled={!saveEnabled || isSaving}
                onClick={commands?.save ?? onSave}
                title={`Save (${SAVE_SHORTCUT})`}
                aria-label={commands?.saveLabel ?? "Save note"}
                className={cn(
                  "rounded-small border px-2 py-0.5 text-xs font-medium transition-colors",
                  saveEnabled
                    ? "border-border bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                    : "border-border/40 bg-muted/40 text-muted-foreground/50 cursor-not-allowed opacity-50",
                  isSaving && "cursor-wait opacity-70"
                )}
              >
                {isSaving ? "Saving…" : (commands?.saveLabel ?? "Save")}
              </button>
            );
          })()
        )}
      </div>
    </div>
  );
}
