import { createContext, useContext, type Dispatch, type RefObject, type SetStateAction } from "react";

import type { NativeMarkdownFileEntry } from "../native/commands";
import type { ExplorerSortOrder } from "./explorerSort";
import type { WorkspaceExplorerState } from "./workspaceExplorerModel";

/**
 * The window's one workspace session: which root is open, how far opening it
 * has got, and what it found. Owned at shell level by `useWorkspaceSession`;
 * the explorer and the rest of the shell read it rather than loading the
 * workspace themselves.
 */
export interface WorkspaceSession extends WorkspaceExplorerState {
  /** The root this window has open or is opening; `null` when none. */
  readonly rootPath: string | null;
  /**
   * The same root, updated before `open` first awaits anything. Async work
   * captures it before an `await` and compares after, so a switch abandons
   * whatever the previous root still had in flight.
   */
  readonly rootRef: RefObject<string | null>;
  /** The open workspace's Markdown files, kept level with the folder. */
  readonly files: readonly NativeMarkdownFileEntry[];
  readonly setFiles: Dispatch<SetStateAction<readonly NativeMarkdownFileEntry[]>>;
  /** Whether dot-prefixed entries are listed; restored per workspace on open. */
  readonly showHidden: boolean;
  /** The tree's ordering; restored per workspace on open. */
  readonly explorerSort: ExplorerSortOrder;
  /** Opens `rootPath` in this window: settings, snapshot, then the listing. */
  readonly open: (rootPath: string) => Promise<void>;
  /**
   * Re-lists `rootPath`. Resolves `false` when the window has moved to another
   * root meanwhile and the listing was dropped; rejects when listing failed.
   */
  readonly refreshEntries: (rootPath: string) => Promise<boolean>;
  readonly setShowHidden: (showHidden: boolean) => void;
  readonly setExplorerSort: (order: ExplorerSortOrder) => void;
  /** Clears an open failure back to the empty state. */
  readonly dismissError: () => void;
}

export const WorkspaceSessionContext = createContext<WorkspaceSession | null>(null);

/**
 * The shell's workspace session. Throws outside a provider rather than
 * returning null, for the same reason the switching context does: a consumer
 * that forgot the provider would otherwise render an explorer stuck empty.
 */
export function useWorkspaceSessionContext(): WorkspaceSession {
  const session = useContext(WorkspaceSessionContext);
  if (session === null) {
    throw new Error(
      "useWorkspaceSessionContext must be used under a WorkspaceSessionContext.Provider."
    );
  }
  return session;
}
