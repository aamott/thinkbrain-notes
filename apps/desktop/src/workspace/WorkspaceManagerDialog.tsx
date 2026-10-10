import { useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Folder, FolderGit2, FolderOpen, Trash2, X } from "lucide-react";
import type { NativeKnownWorkspace, NativeWorkspaceAccessCapabilities } from "../native/commands";
import { useMediaQuery } from "../lib/useMediaQuery";
import { ModalDialog } from "../shell/ModalDialog";
import { DeleteWorkspaceDialog } from "./DeleteWorkspaceDialog";
import { filterWorkspaces, workspaceRowState } from "./workspaceManagerModel";
import { isWorkspaceGitLinked } from "./workspaceSettings";
import { OPEN_FOLDER_LABEL } from "./gitLinkImportCopy";

const FILTER_LABEL = "Filter workspaces";
const FOOTER_HAS_EXTERNAL = "Removing never touches files on disk.";
const FOOTER_MANAGED_ONLY = "Deleting a vault removes it from this device.";

/**
 * The "Manage workspaces…" surface: every known workspace — recents and
 * managed vaults, missing folders included — with open/forget/delete actions
 * and the add/launch/import entries at the top. The delete confirmation opens
 * above it as a second `ModalDialog`; `useDismissable`'s overlay stack keeps
 * Escape aimed at whichever is on top.
 */
export function WorkspaceManagerDialog({
  workspaces,
  capabilities,
  currentPath,
  openElsewhere,
  error,
  onClearError,
  onClose,
  onOpenFolder,
  onCreateWorkspace,
  onImportFromGit,
  onOpenWorkspace,
  onRevealWorkspace,
  onForgetWorkspace,
  onDeleteWorkspace
}: {
  readonly workspaces: readonly NativeKnownWorkspace[];
  readonly capabilities: NativeWorkspaceAccessCapabilities | null;
  readonly currentPath: string | null;
  /** Roots other live windows show — their rows read "Open in another window" / "Focus". */
  readonly openElsewhere?: readonly string[];
  /** A failure belonging to this surface — forget or delete. */
  readonly error: string | null;
  readonly onClearError: () => void;
  readonly onClose: () => void;
  readonly onOpenFolder: () => void;
  readonly onCreateWorkspace: () => void;
  readonly onImportFromGit: () => void;
  readonly onOpenWorkspace: (rootPath: string) => void;
  /** Reveals the workspace folder in the OS file manager (desktop only). */
  readonly onRevealWorkspace: (rootPath: string) => void;
  readonly onForgetWorkspace: (rootPath: string) => void;
  readonly onDeleteWorkspace: (workspace: NativeKnownWorkspace) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<NativeKnownWorkspace | null>(null);
  // Autofocus belongs to fine pointers only: on touch it pops the soft
  // keyboard over the list the user just opened.
  const finePointer = useMediaQuery("(pointer: fine)");
  const [gitLinkedPaths, setGitLinkedPaths] = useState<ReadonlySet<string>>(new Set());
  // Where focus lands after the delete confirm closes over a shrunken list.
  const filterRef = useRef<HTMLInputElement>(null);

  // Same tolerant probe as the selector: a workspace we cannot inspect is
  // simply treated as not Git-linked. Missing folders are skipped — their
  // settings read cannot succeed.
  useEffect(() => {
    let active = true;
    void Promise.all(
      workspaces.filter((entry) => !entry.missing).map(async (entry) => {
        try {
          const linked = await isWorkspaceGitLinked(entry.rootPath);
          return { rootPath: entry.rootPath, linked };
        } catch {
          return { rootPath: entry.rootPath, linked: false };
        }
      })
    ).then((results) => {
      if (active) {
        setGitLinkedPaths(new Set(results.filter((r) => r.linked).map((r) => r.rootPath)));
      }
    });
    return () => {
      active = false;
    };
  }, [workspaces]);

  const visible = useMemo(() => filterWorkspaces(workspaces, query), [workspaces, query]);
  const hasExternal = workspaces.some((entry) => entry.kind === "external");
  // `canOpenFolder` is the native "desktop platform" marker — false on
  // Android and iOS, where the opener plugin has no file manager to drive.
  // The isTauri() half hides the action in plain-browser dev and tests,
  // where a click could only no-op.
  const canReveal = isTauri() && capabilities?.canOpenFolder === true;

  // Header actions close the manager first — the destination surface (folder
  // picker, create dialog, import dialog) should not sit under it.
  const runHeaderAction = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <>
      <ModalDialog title="Workspaces" onDismiss={onClose} size="lg">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {capabilities?.canOpenFolder && (
            <button
              type="button"
              className="min-h-9 rounded-small border border-border px-3 text-xs focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11"
              onClick={runHeaderAction(onOpenFolder)}
            >
              {OPEN_FOLDER_LABEL}
            </button>
          )}
          {capabilities?.canCreateManagedWorkspace && (
            <button
              type="button"
              className="min-h-9 rounded-small border border-border px-3 text-xs focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11"
              onClick={runHeaderAction(onCreateWorkspace)}
            >
              Create workspace
            </button>
          )}
          <button
            type="button"
            className="min-h-9 rounded-small border border-border px-3 text-xs focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11"
            onClick={runHeaderAction(onImportFromGit)}
          >
            Import from Git
          </button>
          <input
            ref={filterRef}
            type="search"
            {...(finePointer ? { "data-initial-focus": "" } : {})}
            aria-label={FILTER_LABEL}
            placeholder={FILTER_LABEL}
            className="min-h-9 min-w-0 flex-1 rounded-small border border-border bg-surface px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {error && !deleteTarget && (
          <p className="m-0 mb-3 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        {visible.length === 0 ? (
          <p className="m-0 py-6 text-center text-xs text-muted-foreground">
            {workspaces.length === 0
              ? "No workspaces yet. Open a folder or create a vault to begin."
              : "No workspaces match the filter."}
          </p>
        ) : (
          <ul className="m-0 grid list-none gap-1 p-0">
            {visible.map((entry) => {
              const row = workspaceRowState(entry, currentPath, openElsewhere);
              const gitLinked = gitLinkedPaths.has(entry.rootPath);
              const Icon = gitLinked ? FolderGit2 : Folder;
              return (
                <li key={entry.rootPath} className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!row.canOpen}
                    title={entry.rootPath}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-small px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent pointer-coarse:min-h-11"
                    onClick={() => {
                      onOpenWorkspace(entry.rootPath);
                      onClose();
                    }}
                  >
                    <Icon aria-hidden="true" className="size-4 flex-none text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {entry.name}
                        {gitLinked && <span className="sr-only"> (Git-linked)</span>}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {entry.rootPath}
                      </span>
                    </span>
                    {row.badge === "current" && (
                      <span className="flex-none rounded-small bg-surface px-1.5 py-0.5 text-[0.625rem] text-muted-foreground">
                        This window
                      </span>
                    )}
                    {row.badge === "missing" && (
                      <span className="flex-none rounded-small border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[0.625rem] text-warning">
                        Folder missing
                      </span>
                    )}
                    {row.badge === "open_elsewhere" && (
                      <span className="flex flex-none flex-col items-end gap-0.5">
                        <span className="rounded-small bg-surface px-1.5 py-0.5 text-[0.625rem] text-muted-foreground">
                          Open in another window
                        </span>
                        <span className="text-[0.625rem] font-semibold text-primary">Focus</span>
                      </span>
                    )}
                  </button>
                  {canReveal && !entry.missing && entry.kind !== "managed" && (
                    <button
                      type="button"
                      aria-label={`Show ${entry.name} in file manager`}
                      title="Show in file manager"
                      className="flex size-9 flex-none items-center justify-center rounded-small text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:size-11"
                      onClick={() => onRevealWorkspace(entry.rootPath)}
                    >
                      <FolderOpen aria-hidden="true" className="size-4" />
                    </button>
                  )}
                  {row.removal === "forget" && (
                    <button
                      type="button"
                      aria-label={`Remove ${entry.name} from list`}
                      title="Remove from list"
                      className="flex size-9 flex-none items-center justify-center rounded-small text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:size-11"
                      onClick={() => onForgetWorkspace(entry.rootPath)}
                    >
                      <X aria-hidden="true" className="size-4" />
                    </button>
                  )}
                  {row.removal === "delete" && (
                    <button
                      type="button"
                      aria-label={`Delete ${entry.name}…`}
                      title={`Delete ${entry.name}…`}
                      className="flex size-9 flex-none items-center justify-center rounded-small text-danger hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:size-11"
                      onClick={() => {
                        onClearError();
                        setDeleteTarget(entry);
                      }}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="m-0 mt-3 border-t border-border pt-3 text-[0.6875rem] text-muted-foreground">
          {hasExternal || !capabilities?.canCreateManagedWorkspace
            ? FOOTER_HAS_EXTERNAL
            : FOOTER_MANAGED_ONLY}
        </p>
      </ModalDialog>
      {deleteTarget && (
        <DeleteWorkspaceDialog
          workspace={deleteTarget}
          error={error}
          onCancel={() => {
            onClearError();
            setDeleteTarget(null);
          }}
          onDelete={async () => {
            const ok = await onDeleteWorkspace(deleteTarget);
            // On success the manager stays open over a refreshed list; on
            // failure this dialog stays up to show the error.
            if (ok) {
              setDeleteTarget(null);
              // The trash button this dialog restores focus to is gone with
              // the row — land on the filter instead of dropping to <body>.
              filterRef.current?.focus();
            }
            return ok;
          }}
        />
      )}
    </>
  );
}
