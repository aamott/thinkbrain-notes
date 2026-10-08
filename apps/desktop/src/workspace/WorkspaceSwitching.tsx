import { useState, type FormEvent } from "react";
import { ModalDialog } from "../shell/ModalDialog";
import { GitLinkImportDialog } from "./GitLinkImportDialog";
import { WorkspaceManagerDialog } from "./WorkspaceManagerDialog";
import { WorkspaceSelector } from "./WorkspaceSelector";
import { WorkspaceSelectorPortal } from "./WorkspaceSelectorPortal";
import type { WorkspaceSelectorVariant } from "./WorkspaceSelectorPortalModel";
import type { WorkspaceSwitchingController } from "./useWorkspaceSwitching";

/**
 * The selector bound to the explorer's switching controller. Same controller
 * props wherever the selector lands — inline, title bar, or drawer — so
 * switching and its dialogs behave identically per placement.
 */
export function WorkspaceSwitchingSelector({
  switching,
  currentPath,
  variant,
  onAction
}: {
  readonly switching: WorkspaceSwitchingController;
  readonly currentPath?: string;
  readonly variant: WorkspaceSelectorVariant;
  readonly onAction?: () => void;
}) {
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
 * Workspace onboarding surfaces: the uninstall notice after a managed vault is
 * created, the portaled selector, and the create/import dialogs.
 */
export function WorkspaceSwitching({
  switching,
  currentPath,
  busy,
  error
}: {
  readonly switching: WorkspaceSwitchingController;
  readonly currentPath?: string;
  readonly busy: boolean;
  readonly error: string | null;
}) {
  const { accessCapabilities } = switching;
  return (
    <>
      {switching.managedStorageNoticeOpen && (
        <ManagedStorageNotice onDismiss={() => switching.setManagedStorageNoticeOpen(false)} />
      )}
      <WorkspaceSelectorPortal>
        {(variant, onAction) => (
          <WorkspaceSwitchingSelector switching={switching} currentPath={currentPath} variant={variant} onAction={onAction} />
        )}
      </WorkspaceSelectorPortal>
      {switching.createManagedWorkspaceOpen && (
        <CreateManagedWorkspaceDialog
          busy={busy}
          error={error}
          onCancel={() => switching.setCreateManagedWorkspaceOpen(false)}
          onCreate={switching.createManagedWorkspace}
        />
      )}
      {switching.manageWorkspacesOpen && (
        <WorkspaceManagerDialog
          workspaces={switching.knownWorkspaces}
          capabilities={accessCapabilities}
          currentPath={currentPath ?? null}
          error={switching.manageWorkspacesError}
          onClearError={switching.clearManageWorkspacesError}
          onClose={() => switching.setManageWorkspacesOpen(false)}
          onOpenFolder={() => void switching.openWorkspace()}
          onCreateWorkspace={() => switching.setCreateManagedWorkspaceOpen(true)}
          onImportFromGit={switching.openGitLinkImport}
          onOpenWorkspace={(rootPath) => void switching.launchWorkspace(rootPath)}
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

function ManagedStorageNotice({ onDismiss }: { readonly onDismiss: () => void }) {
  return (
    <div className="m-2 rounded-small border border-warning/50 bg-warning/10 p-2 text-[0.6875rem] leading-relaxed text-sidebar-foreground" role="status">
      <p className="m-0">Android removes managed vaults when the app is uninstalled. Keep another copy using Git or an explicit backup/export when available.</p>
      <button type="button" className="mt-1.5 min-h-11 rounded-small border border-border px-3 text-[0.6875rem]" onClick={onDismiss}>Got it</button>
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
