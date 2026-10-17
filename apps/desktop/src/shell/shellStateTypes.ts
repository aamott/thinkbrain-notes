/**
 * The `ShellState` contract — the whole bag {@link useShellState} publishes,
 * as both chromes consume it.
 *
 * In its own module rather than beside the hook because `useShellState.ts`
 * composes half a dozen hooks and the interface alone would push the file
 * over the repo's size guideline.
 */

import type { Dispatch, SetStateAction } from "react";
import type { MarkdownLinkTarget } from "@thinkbrain/core";
import type { DesktopCommand } from "../commands/commandRegistry";
import type { NativeMarkdownFileEntry } from "../native/commands";
import type { SyncStatus } from "../sync/historyTypes";
import type {
  DesktopTab,
  DesktopTabAction,
  DesktopTabState,
  EditorLocation,
  TabOpenPlacement
} from "../tabs/tabModel";
import type { NoteIndexEntry } from "@thinkbrain/core";
import type { WorkspaceSwitchingController } from "../workspace/useWorkspaceSwitching";
import type { WorkspaceExplorerProps } from "../workspace/WorkspaceExplorer";
import type { WorkspaceSession } from "../workspace/workspaceSession";
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
  /**
   * The departure-enriched dispatch: any action that moves the user somewhere
   * (`open`, `activate`, `goBack`, `goForward`, `restoreVisit`,
   * `navigateToLocation`) first snapshots the live editor's position into the
   * visit being left. All tab dispatches should flow through this.
   */
  readonly dispatchTabs: Dispatch<DesktopTabAction>;
  /**
   * Jumps to a 1-based line in the active document — an outline heading
   * click. Captures the departing position, records an in-file visit, and
   * lands the cursor at the line's start.
   */
  readonly navigateToLine: (line: number) => void;
  /**
   * Restores a recorded visit by its numeric id within the active trail —
   * moves the history cursor and puts the visit's document into the active
   * strip slot, reopening it from its retained descriptor when displaced.
   * Other trails' visits are refused: switching trails is an explicit
   * `activate`, not a traversal.
   */
  readonly goToVisit: (visitId: number) => void;
  /**
   * Snapshots the live editor's position into the current visit — for a
   * chrome about to hide the tab surface (phone: leaving a tab for Home or a
   * panel). Returns the captured location, or `null` when there is none.
   */
  readonly captureCurrentLocation: () => EditorLocation | null;
  readonly activeTab: DesktopTab | null;
  readonly activeDocument: DocumentViewState | undefined;
  readonly documents: Readonly<Record<string, DocumentViewState>>;
  readonly conflicts: ReadonlySet<string>;
  readonly unsavedNoteContents: string | null;
  readonly saveDocument: (tab: DesktopTab) => Promise<boolean>;
  /**
   * The save-first guard every navigation that could displace the on-screen
   * document must pass: saves the active tab when dirty and answers `false`
   * — stay in place — when the save fails or newer edits remain unsaved.
   */
  readonly beforeNavigate: () => Promise<boolean>;
  readonly updateDocument: (tabId: string, contents: string) => void;
  readonly loadDocumentIntoView: (tabId: string, rootPath: string, relativePath: string, kind?: string) => void;
  /** Returns the destination view's actual tab id — collision suffix included. */
  readonly openMarkdownDocument: (rootPath: string, relativePath: string, placement?: TabOpenPlacement) => string;
  /** Returns the destination view's actual tab id — collision suffix included. */
  readonly openFileDocument: (rootPath: string, relativePath: string, placement?: TabOpenPlacement) => string;
  /** Opens a blank landing tab; returns its id so the chrome can navigate to it. */
  readonly openNewTab: () => string;
  readonly keepMyVersion: (tab: DesktopTab) => void;
  readonly loadDiskVersion: (tab: DesktopTab) => void;
  readonly dismissEmptied: (tabId: string) => void;
  readonly renameDocument: (rootPath: string, relativePath: string, newRelativePath: string) => Promise<void>;
  readonly onOpenNote: (relativePath: string) => void;
  /**
   * Follows a resolved `[[wiki]]` or `[text](target)` link — internal
   * targets open the vault file in the tab kind its extension implies,
   * external ones go to the OS.
   */
  readonly onOpenLink: (target: MarkdownLinkTarget) => void;

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

  // workspace
  readonly workspaceName: string | null;
  readonly restoredWorkspacePath: string | null;
  readonly workspaceFiles: readonly NativeMarkdownFileEntry[];
  readonly stateRestored: boolean;
  /** Opens a workspace in this window through the workspace session. */
  readonly openWorkspaceInWindow: (rootPath: string) => Promise<void>;
  /**
   * The window's one workspace session — open root, phase, snapshot, entries.
   * Chromes publish it to the explorer; nothing else loads a workspace.
   */
  readonly workspaceSession: WorkspaceSession;
  /** The one switching controller, shared by every chrome. */
  readonly switching: WorkspaceSwitchingController;
  /** The explorer's whole prop bag, assembled once so both chromes agree. */
  readonly explorerProps: WorkspaceExplorerProps;
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
