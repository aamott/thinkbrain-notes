import { createContributionRegistry, type ContributionRegistry } from "@thinkbrain/core";
import { useSyncExternalStore } from "react";
import type { DesktopCommandId } from "./commandRegistry";

export interface MobileNewNoteAction {
  readonly id: string;
  readonly commandId: DesktopCommandId;
  readonly label: string;
  readonly icon: string;
  readonly requiresWorkspace?: boolean;
}
export type MobileNewNoteActionRegistry = ContributionRegistry<MobileNewNoteAction>;
export const createMobileNewNoteActionRegistry = (
  initialActions: readonly MobileNewNoteAction[] = []
): MobileNewNoteActionRegistry => createContributionRegistry(initialActions);
export const mobileNewNoteActionRegistry = createMobileNewNoteActionRegistry();
export const useMobileNewNoteActions = (): readonly MobileNewNoteAction[] =>
  useSyncExternalStore(
    mobileNewNoteActionRegistry.subscribe,
    mobileNewNoteActionRegistry.entries,
    mobileNewNoteActionRegistry.entries
  );
