import {
  createContributionRegistry,
  type ContributionRegistry,
  type PanelContribution
} from "@thinkbrain/core";
import type { ReactNode } from "react";
import { SourceControlPanel } from "../git/SourceControlPanel";
import { SearchPanel } from "../search/SearchPanel";
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

/** Open panel identifier, including future extension-owned IDs. */
export type DesktopPanelId = BuiltInDesktopPanelId | (string & {});

/** Activity-bar panel id selected on the left side of the shell. */
export type LeftPanel = DesktopPanelId;

/** Title-bar panel id selected on the right side of the shell. */
export type RightPanel = DesktopPanelId;

/** A core panel contribution specialized to React render factories. */
export type DesktopPanelContribution = PanelContribution<ReactNode, DesktopPanelContext> & {
  readonly id: DesktopPanelId;
  /** Keeps stateful content mounted while another panel on the same side is active. */
  readonly keepMounted?: boolean;
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
    availability: () => false,
    factory: () => (
      <Unavailable title="extensions" description="Extensions will appear here when the capability sandbox is ready." />
    )
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

/** Looks up a registered panel and fails loudly when a shell id is invalid. */
export function getDesktopPanel(id: DesktopPanelId): DesktopPanelContribution {
  const panel = desktopPanelRegistry.get(id);
  if (!panel) throw new Error(`Desktop panel '${id}' is not registered.`);
  return panel;
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
