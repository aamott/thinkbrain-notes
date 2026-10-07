import { create } from "zustand";

import type { NativeWorkspaceAccessCapabilities } from "../native/commands";

/**
 * The create/open entry points a surface can offer when no workspace is open.
 *
 * The actions are owned by the explorer's switching controller — it holds the
 * dialogs and the open/launch logic — and published here so surfaces outside
 * the explorer tree (the welcome tab) can offer the same entry points without
 * reimplementing them. Dialog-opening actions render inside the explorer, so
 * callers should surface the explorer first (left popout on desktop, the Files
 * route on phone) exactly as the workspace selector's `onAction` does.
 */
export interface WorkspaceOnboardingActions {
  /** Platform capabilities, or null while the probe is in flight. */
  readonly capabilities: NativeWorkspaceAccessCapabilities | null;
  /** Managed vaults then recents — the selector's quick-open list. */
  readonly paths: readonly string[];
  readonly openFolder: () => void;
  readonly createManagedVault: () => void;
  readonly importFromGit: () => void;
  readonly openPath: (rootPath: string) => void;
}

interface WorkspaceOnboardingStore {
  readonly actions: WorkspaceOnboardingActions | null;
}

export const useWorkspaceOnboardingStore = create<WorkspaceOnboardingStore>(() => ({
  actions: null
}));

/** The explorer publishes its switching surface while mounted. */
export function publishWorkspaceOnboarding(actions: WorkspaceOnboardingActions | null): void {
  useWorkspaceOnboardingStore.setState({ actions });
}
