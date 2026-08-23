import { useEffect, useState, type ReactNode } from "react";
import { Folder, FolderGit2 } from "lucide-react";
import type { DesktopTab } from "../tabs/tabModel";
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

  const pathSegments = activeTab?.resource?.relativePath
    ? activeTab.resource.relativePath.split("/").filter(Boolean)
    : activeTab ? [activeTab.title] : [];

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
        {activeTab?.kind === "editor" && (
          <button
            type="button"
            disabled={!isDirty || isSaving}
            onClick={onSave}
            title={`Save (${SAVE_SHORTCUT})`}
            aria-label="Save note"
            className={cn(
              "rounded-small border px-2 py-0.5 text-xs font-medium transition-colors",
              isDirty
                ? "border-border bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                : "border-border/40 bg-muted/40 text-muted-foreground/50 cursor-not-allowed opacity-50",
              isSaving && "cursor-wait opacity-70"
            )}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}
