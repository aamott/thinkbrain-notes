import {
  createContributionRegistry,
  type ContributionRegistry,
  type PanelContribution
} from "@thinkbrain/core";
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { SourceControlPanel } from "../git/SourceControlPanel";
import { SearchPanel } from "../search/SearchPanel";
import { ExtensionsPanel } from "../extensions/ExtensionsPanel";
import { Unavailable } from "../shell/Unavailable";
import { AssistantPanelSurface } from "./AssistantPanelSurface";
import { OutlinePanel } from "./OutlinePanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { WorkspaceExplorer, type WorkspaceExplorerProps } from "../workspace/WorkspaceExplorer";

/** Context supplied to desktop panel render factories. */
export interface DesktopPanelContext {
  /** Current workspace root, or `null` before a workspace is opened. */
  readonly rootPath: string | null;
  /** Ready contents of the active Markdown document, or `null`. */
  readonly documentContents: string | null;
  /** Explorer callbacks and state owned by the desktop shell. */
  readonly explorerProps: WorkspaceExplorerProps;
  /** Opens a Markdown file selected by the search panel. */
  readonly onOpenSearchResult: (relativePath: string) => void;
}

/** Stable identifiers for first-party desktop sidebar panels. */
export type BuiltInDesktopPanelId =
  | "explorer"
  | "search"
  | "source-control"
  | "tags"
  | "extensions"
  | "outline"
  | "backlinks"
  | "properties"
  | "assistant";

/**
 * First-party panel ids rendered on the left side of the shell.
 *
 * Narrow on purpose: shell selection state accepts only these ids so a typo
 * (`"exlorer"`) is a compile-time error. Extension-owned left ids remain valid
 * for registry registration/lookup via the wide {@link DesktopPanelId} but are
 * not selectable shell state until extension selection is implemented.
 */
export type BuiltInLeftPanel =
  | "explorer"
  | "search"
  | "source-control"
  | "tags"
  | "extensions";

/**
 * First-party panel ids rendered on the right side of the shell.
 *
 * Narrow on purpose: shell selection state accepts only these ids so a typo
 * (`"propeties"`) is a compile-time error. Extension-owned right ids remain
 * valid for registry registration/lookup via the wide {@link DesktopPanelId}
 * but are not selectable shell state until extension selection is implemented.
 */
export type BuiltInRightPanel =
  | "outline"
  | "backlinks"
  | "properties"
  | "assistant";

/** Open panel identifier, including future extension-owned IDs. */
export type DesktopPanelId = BuiltInDesktopPanelId | (string & {});

/**
 * Activity-bar panel id selected on the left side of the shell.
 *
 * Wide enough to accept extension-registered panel ids (e.g. the journal
 * extension's `"journal"` id) that are selectable today. `BuiltInLeftPanel`
 * is the narrow union used for compile-time checks at call sites that pass
 * literal built-in ids.
 */
export type LeftPanel = BuiltInLeftPanel | (string & {});

/**
 * Title-bar panel id selected on the right side of the shell.
 *
 * See {@link LeftPanel} for the rationale.
 */
export type RightPanel = BuiltInRightPanel | (string & {});

/**
 * Runtime guard narrowing an arbitrary id to a built-in left panel id.
 *
 * Used by shell callbacks that receive a wide string (e.g. `revealPanel`) to
 * safely feed only valid built-in ids into narrow shell state. Extension-owned
 * ids are intentionally dropped here — extension selection is not implemented
 * by the narrow-id maintenance story.
 */
export function isBuiltInLeftPanel(id: string): id is BuiltInLeftPanel {
  return id === "explorer"
    || id === "search"
    || id === "source-control"
    || id === "tags"
    || id === "extensions";
}

/**
 * Runtime guard narrowing an arbitrary id to a built-in right panel id.
 *
 * See {@link isBuiltInLeftPanel} for the rationale.
 */
export function isBuiltInRightPanel(id: string): id is BuiltInRightPanel {
  return id === "outline"
    || id === "backlinks"
    || id === "properties"
    || id === "assistant";
}

/**
 * A button a panel contributes to its own header.
 *
 * Data rather than markup, so an extension that mounted plain DOM contributes
 * one exactly as a first-party React panel does.
 */
export interface PanelAction {
  /** Unique within the panel; used as the React key and in failure reports. */
  readonly id: string;
  /** Accessible name and tooltip. */
  readonly label: string;
  /** Single glyph shown on the button. */
  readonly icon: string;
  run(): void | Promise<void>;
}

/** A core panel contribution specialized to React render factories. */
export type DesktopPanelContribution = PanelContribution<ReactNode, DesktopPanelContext> & {
  readonly id: DesktopPanelId;
  /** Keeps stateful content mounted while another panel on the same side is active. */
  readonly keepMounted?: boolean;
  /** Buttons rendered in the panel header, in declaration order. */
  readonly actions?: readonly PanelAction[];
};

/** The left-side subset used by the activity bar and left popout. */
export type LeftPanelContribution = DesktopPanelContribution & {
  readonly side: "left";
};

/** The right-side subset used by the title bar and right popout. */
export type RightPanelContribution = DesktopPanelContribution & {
  readonly side: "right";
};

/** All first-party panels, in their existing activity-bar/title-bar order. */
export const builtInDesktopPanels: readonly DesktopPanelContribution[] = [
  {
    id: "explorer",
    label: "Explorer",
    icon: "▱",
    side: "left",
    keepMounted: true,
    availability: () => true,
    factory: ({ explorerProps }) => <WorkspaceExplorer {...explorerProps} />
  },
  {
    id: "search",
    label: "Search",
    icon: "⌕",
    side: "left",
    availability: () => true,
    factory: ({ onOpenSearchResult, rootPath }) => (
      <SearchPanel rootPath={rootPath} onOpenFile={onOpenSearchResult} />
    )
  },
  {
    id: "source-control",
    label: "Source control",
    icon: "⑂",
    side: "left",
    keepMounted: true,
    availability: () => true,
    factory: ({ rootPath }) => <SourceControlPanel rootPath={rootPath} />
  },
  {
    id: "tags",
    label: "Tags",
    icon: "#",
    side: "left",
    availability: () => false,
    factory: () => (
      <Unavailable title="tags" description="Tags will appear here once note indexing is available." />
    )
  },
  {
    id: "extensions",
    label: "Extensions",
    icon: "⊞",
    side: "left",
    factory: () => <ExtensionsPanel />
  },
  {
    id: "outline",
    label: "Outline",
    icon: "☷",
    side: "right",
    keepMounted: true,
    availability: () => true,
    factory: ({ documentContents }) => <OutlinePanel contents={documentContents} />
  },
  {
    id: "backlinks",
    label: "Backlinks",
    icon: "↩",
    side: "right",
    availability: () => false,
    factory: () => (
      <Unavailable
        title="Backlinks unavailable"
        description="This inspector activates after the workspace link index is available."
      />
    )
  },
  {
    id: "properties",
    label: "Properties",
    icon: "☰",
    side: "right",
    keepMounted: true,
    availability: () => true,
    factory: ({ documentContents }) => <PropertiesPanel contents={documentContents} />
  },
  {
    id: "assistant",
    label: "Assistant",
    icon: "✦",
    side: "right",
    keepMounted: true,
    availability: () => true,
    factory: () => <AssistantPanelSurface />
  }
];

/** Registry contract exposed to the desktop shell and panel extension points. */
export interface DesktopPanelRegistry extends ContributionRegistry<DesktopPanelContribution> {
  /** Returns panels on one side, preserving registration order. */
  entriesBySide<Side extends "left" | "right">(
    side: Side
  ): readonly (DesktopPanelContribution & { readonly side: Side })[];
  /** Returns whether a panel can be used for the supplied desktop context. */
  isAvailable(id: string, context: DesktopPanelContext): boolean;
}

/** Narrows a registered contribution to one side without unsafe casts. */
function isPanelOnSide<Side extends "left" | "right">(
  panel: DesktopPanelContribution,
  side: Side
): panel is DesktopPanelContribution & { readonly side: Side } {
  return panel.side === side;
}

/**
 * Creates a fresh desktop panel registry.
 *
 * The core registry supplies ordered storage and loud duplicate rejection; this
 * adapter adds React-specific factories and side/availability helpers.
 */
export function createDesktopPanelRegistry(
  initialPanels: readonly DesktopPanelContribution[] = builtInDesktopPanels
): DesktopPanelRegistry {
  const coreRegistry = createContributionRegistry(initialPanels);
  return {
    register: coreRegistry.register,
    get: coreRegistry.get,
    entries: coreRegistry.entries,
    subscribe: coreRegistry.subscribe,
    entriesBySide: (side) =>
      coreRegistry.entries().filter((panel) => isPanelOnSide(panel, side)),
    isAvailable: (id, context) => {
      const panel = coreRegistry.get(id);
      return panel ? panel.availability?.(context) ?? true : false;
    }
  };
}

/** Shared first-party registry consumed by desktop shell components. */
export const desktopPanelRegistry = createDesktopPanelRegistry();

/** Invokes a contribution's React factory. */
export function renderDesktopPanel(
  panel: DesktopPanelContribution,
  context: DesktopPanelContext
): ReactNode {
  return panel.factory(context);
}

/**
 * Render-safe lookup that returns the contribution or `undefined` instead of
 * throwing. Use this in React render paths so an unregistered id degrades to a
 * fallback instead of unmounting the shell.
 */
export function getDesktopPanelOrUndefined(
  id: DesktopPanelId
): DesktopPanelContribution | undefined {
  return desktopPanelRegistry.get(id);
}

/** Returns the registered left-side panels for activity-bar rendering. */
export function getLeftPanelContributions(): readonly LeftPanelContribution[] {
  return desktopPanelRegistry.entriesBySide("left");
}

/** Returns the registered right-side panels for title-bar/popout rendering. */
export function getRightPanelContributions(): readonly RightPanelContribution[] {
  return desktopPanelRegistry.entriesBySide("right");
}

/**
 * Subscribes a component to the panels registered on one side.
 *
 * Reading the registry once during render is not enough: an extension loaded
 * from disk registers its panels while the app is already running. The filtered
 * result is memoised because `useSyncExternalStore` compares snapshots by
 * reference, and a fresh array on every render would loop.
 */
function usePanelContributions<Side extends "left" | "right">(
  side: Side
): readonly (DesktopPanelContribution & { readonly side: Side })[] {
  const entries = useSyncExternalStore(
    desktopPanelRegistry.subscribe,
    desktopPanelRegistry.entries,
    desktopPanelRegistry.entries
  );
  return useMemo(
    () => entries.filter((panel) => isPanelOnSide(panel, side)),
    [entries, side]
  );
}

/** Live left-side panels for activity-bar rendering. */
export function useLeftPanelContributions(): readonly LeftPanelContribution[] {
  return usePanelContributions("left");
}

/** Live right-side panels for title-bar and popout rendering. */
export function useRightPanelContributions(): readonly RightPanelContribution[] {
  return usePanelContributions("right");
}
