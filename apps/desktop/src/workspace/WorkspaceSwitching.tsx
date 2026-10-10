import { useState, type FormEvent } from "react";
import { ModalDialog } from "../shell/ModalDialog";
import { GitLinkImportDialog } from "./GitLinkImportDialog";
import { WorkspaceManagerDialog } from "./WorkspaceManagerDialog";
import { WorkspaceSelector } from "./WorkspaceSelector";
import {
  useWorkspaceSwitchingContext,
  type WorkspaceSelectorVariant
} from "./workspaceSwitchingContext";

/**
 * The selector bound to the shell's shared switching controller. Every
 * placement — title bar, panel header, phone drawer — renders its own
 * instance against the same controller, so switching and its dialogs behave
 * identically everywhere.
 */
export function WorkspaceSwitchingSelector({
  currentPath,
  variant,
  onAction
}: {
  readonly currentPath?: string;
  readonly variant: WorkspaceSelectorVariant;
  readonly onAction?: () => void;
}) {
  const switching = useWorkspaceSwitchingContext();
  return (
    <WorkspaceSelector
      variant={variant}
      onAction={onAction}
      capabilities={switching.accessCapabilities}
      currentPath={currentPath}
      workspaces={switching.knownWorkspaces}
      onAdd={switching.openWorkspace}
      onCreateManaged={() => switching.setCreateManagedWorkspaceOpen(true)}
      onImportFromGit={switching.openGitLinkImport}
      onSelect={switching.launchWorkspace}
      onManage={switching.openManageWorkspaces}
      onMenuOpen={switching.refreshKnownWorkspaces}
    />
  );
}

/**
 * The dialogs the switching surfaces open, mounted once at shell level so
 * they are visible whichever placement — or onboarding action — opened them.
 */
export function WorkspaceSwitchingDialogs({
  currentPath
}: {
  readonly currentPath?: string;
}) {
  const switching = useWorkspaceSwitchingContext();
  const { accessCapabilities } = switching;
  return (
    <>
      {switching.createManagedWorkspaceOpen && (
        <CreateManagedWorkspaceDialog
          busy={switching.creatingManagedWorkspace}
          error={switching.createManagedWorkspaceError}
          onCancel={() => switching.setCreateManagedWorkspaceOpen(false)}
          onCreate={switching.createManagedWorkspace}
        />
      )}
      {switching.manageWorkspacesOpen && (
        <WorkspaceManagerDialog
          workspaces={switching.knownWorkspaces}
          capabilities={accessCapabilities}
          currentPath={currentPath ?? null}
          openElsewhere={switching.rootsOpenElsewhere}
          error={switching.manageWorkspacesError}
          onClearError={switching.clearManageWorkspacesError}
          onClose={() => switching.setManageWorkspacesOpen(false)}
          onOpenFolder={() => void switching.openWorkspace()}
          onCreateWorkspace={() => switching.setCreateManagedWorkspaceOpen(true)}
          onImportFromGit={switching.openGitLinkImport}
          onOpenWorkspace={(rootPath) => void switching.launchWorkspace(rootPath)}
          onRevealWorkspace={(rootPath) => void switching.revealWorkspaceFolder(rootPath)}
          onForgetWorkspace={(rootPath) => void switching.forgetWorkspaceEntry(rootPath)}
          onDeleteWorkspace={(workspace) => switching.deleteManagedWorkspace(workspace.rootPath)}
        />
      )}
      {switching.importFromGitOpen && (
        <GitLinkImportDialog
          managedDestination={accessCapabilities?.canCreateManagedWorkspace === true}
          onClose={() => switching.setImportFromGitOpen(false)}
          onImported={accessCapabilities?.canCreateManagedWorkspace
            ? (rootPath) => void switching.launchWorkspace(rootPath)
            : undefined}
        />
      )}
    </>
  );
}

/**
 * The uninstall notice shown after a managed vault is created. In-panel
 * status rather than a modal, so it stays inline in the explorer — the one
 * place the user can act on it (export, Git-link) — while the dialogs live
 * at shell level.
 */
export function ManagedStorageNotice() {
  const switching = useWorkspaceSwitchingContext();
  if (!switching.managedStorageNoticeOpen) return null;
  return (
    <div className="m-2 rounded-small border border-warning/50 bg-warning/10 p-2 text-[0.6875rem] leading-relaxed text-sidebar-foreground" role="status">
      <p className="m-0">Android removes managed vaults when the app is uninstalled. Keep another copy using Git or an explicit backup/export when available.</p>
      <button type="button" className="mt-1.5 min-h-11 rounded-small border border-border px-3 text-[0.6875rem]" onClick={() => switching.setManagedStorageNoticeOpen(false)}>Got it</button>
    </div>
  );
}

function CreateManagedWorkspaceDialog({
  busy,
  error,
  onCancel,
  onCreate
}: {
  readonly busy: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onCreate: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!busy && name.trim()) void onCreate(name);
  };
  return (
    <ModalDialog
      title="Create managed vault"
      description="The vault is stored privately by the app and is removed if Android uninstalls it."
      busy={busy}
      onDismiss={onCancel}
    >
      <form className="grid gap-3" onSubmit={submit}>
        <label className="grid gap-1 text-xs">
          Vault name
          <input autoFocus className="min-h-11 rounded-small border border-border bg-surface px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={busy} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        {error && <p className="m-0 text-xs text-danger" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="min-h-11 rounded-small border border-border px-3 text-xs" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="submit" className="min-h-11 rounded-small bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50" disabled={busy || !name.trim()}>Create</button>
        </div>
      </form>
    </ModalDialog>
  );
}
