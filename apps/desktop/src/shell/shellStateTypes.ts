/**
 * The `ShellState` contract — the whole bag {@link useShellState} publishes,
 * as both chromes consume it.
 *
 * In its own module rather than beside the hook because `useShellState.ts`
 * composes half a dozen hooks and the interface alone would push the file
 * over the repo's size guideline.
 */

import type { Dispatch, SetStateAction } from "react";
import type { DesktopCommand } from "../commands/commandRegistry";
import type { NativeMarkdownFileEntry } from "../native/commands";
import type { SyncStatus } from "../sync/historyTypes";
import type { DesktopTab, DesktopTabAction, DesktopTabState, TabOpenPlacement } from "../tabs/tabModel";
import type { NoteIndexEntry } from "@thinkbrain/core";
import type { WorkspaceExplorerProps } from "../workspace/WorkspaceExplorer";
import type { AppUpdate } from "./useAppUpdate";
import type { PanelResize } from "./usePanelResize";
import type {
  BottomPanel,
  DocumentViewState,
  LeftPanel,
  PanelSide,
  RightPanel
} from "./shellTypes";

/** The shell's whole state, as both chromes consume it. */
export interface ShellState {
  // tabs & documents
  readonly tabState: DesktopTabState;
  readonly dispatchTabs: Dispatch<DesktopTabAction>;
  readonly activeTab: DesktopTab | null;
  readonly activeDocument: DocumentViewState | undefined;
  readonly documents: Readonly<Record<string, DocumentViewState>>;
  readonly conflicts: ReadonlySet<string>;
  readonly unsavedNoteContents: string | null;
  readonly saveDocument: (tab: DesktopTab) => Promise<boolean>;
  readonly updateDocument: (tabId: string, contents: string) => void;
  readonly loadDocumentIntoView: (tabId: string, rootPath: string, relativePath: string, kind?: string) => void;
  readonly openMarkdownDocument: (rootPath: string, relativePath: string, placement?: TabOpenPlacement) => void;
  readonly openFileDocument: (rootPath: string, relativePath: string, placement?: TabOpenPlacement) => void;
  /** Opens a blank landing tab; returns its id so the chrome can navigate to it. */
  readonly openNewTab: () => string;
  readonly keepMyVersion: (tab: DesktopTab) => void;
  readonly loadDiskVersion: (tab: DesktopTab) => void;
  readonly dismissEmptied: (tabId: string) => void;
  readonly renameDocument: (rootPath: string, relativePath: string, newRelativePath: string) => Promise<void>;
  readonly onOpenNote: (relativePath: string) => void;

  // panels
  readonly leftPanel: LeftPanel | null;
  readonly rightPanel: RightPanel | null;
  readonly setRightPanel: Dispatch<SetStateAction<RightPanel | null>>;
  /** Sets the left panel without toggling. Prefer {@link selectLeftPanel} for user toggles. */
  readonly setLeftPanel: Dispatch<SetStateAction<LeftPanel | null>>;
  readonly selectLeftPanel: (panel: LeftPanel) => void;
  /** Reveals a right panel, or closes it when it is already the open one. */
  readonly toggleRightPanel: (panel: RightPanel) => void;
  readonly bottomPanel: BottomPanel | null;
  readonly updateBottomPanel: (panel: BottomPanel | null) => void;
  readonly toggleBottomPanel: () => void;

  // workspace
  readonly workspaceName: string | null;
  readonly restoredWorkspacePath: string | null;
  readonly workspaceFiles: readonly NativeMarkdownFileEntry[];
  readonly stateRestored: boolean;
  /** The explorer's whole prop bag, assembled once so both chromes agree. */
  readonly explorerProps: WorkspaceExplorerProps;
  /**
   * The explorer's "Previous versions…": opens the file — by its inferred
   * kind, so media opens in a viewer — and reveals its Version history.
   */
  readonly showVersionsOf: (rootPath: string, relativePath: string) => void;
  /**
   * Sync surfaces live on opposite docks: conflicts are an attention list on
   * the left, Version history inspects the active file on the right.
   */
  readonly openSyncPanel: (panel: "conflicts" | "history") => void;
  /** Opens a read-only comparison of `notePath` against the recorded change. */
  readonly compareVersion: (notePath: string, changeId: string, versionAt?: number | null) => void;
  /**
   * Puts a recorded version back.
   *
   * An open dirty editor on that file holds edits a restore would overwrite,
   * so it is saved first — and a refused or failed save aborts the restore
   * rather than losing them. The native restore checkpoints what it replaces.
   */
  readonly restoreVersionSafely: (notePath: string, changeId: string) => Promise<void>;
  /** Opens Settings scrolled to the workspace sync section. */
  readonly openSyncSettings: () => void;
  readonly reviewConflict: (copyPath: string, notePath: string) => void;

  // chrome-agnostic services
  readonly paletteOpen: boolean;
  readonly openPalette: () => void;
  readonly closePalette: (restoreFocus?: boolean) => void;
  readonly paletteCommands: readonly DesktopCommand[];
  readonly runCommand: (command: DesktopCommand) => void;
  readonly openSettingsTab: () => void;
  readonly syncStatus: SyncStatus;
  readonly conflictBadges: Readonly<Record<string, number>>;
  readonly noteIndex: readonly NoteIndexEntry[];
  readonly update: AppUpdate;

  // desktop-only, ignored by PhoneShell
  readonly leftWidth: number;
  readonly rightWidth: number;
  readonly resize: PanelResize;
  readonly resetPanelWidth: (side: PanelSide) => void;
}
