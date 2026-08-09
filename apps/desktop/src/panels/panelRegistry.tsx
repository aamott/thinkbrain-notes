import {
  createContributionRegistry,
  type ContributionRegistry,
  type PanelContribution,
  type PanelFactory
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

/** State a left-side panel factory may read (explorer/search only). */
export interface LeftPanelContext {
  /** Current workspace root, or `null` before a workspace is opened. */
  readonly rootPath: string | null;
  /** Explorer callbacks and state owned by the desktop shell. */
  readonly explorerProps: WorkspaceExplorerProps;
  /** Opens a Markdown file selected by the search panel. */
  readonly onOpenSearchResult: (relativePath: string) => void;
}

/** State a right-side panel factory may read (inspector panels only). */
export interface RightPanelContext {
  /** Current workspace root, or `null` before a workspace is opened. */
  readonly rootPath: string | null;
  /** Ready contents of the active Markdown document, or `null`. */
  readonly documentContents: string | null;
}

/**
 * Registry-internal wide context — the intersection of both side contexts.
 * Exists so the heterogeneous registry and side-agnostic extension host can
 * store one factory type; side-specific contributions narrow the factory.
 */
export interface DesktopPanelContext extends LeftPanelContext, RightPanelContext {}

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

/** Base for side-narrowed contribution types (omits side-specific factory/availability). */
type DesktopPanelContributionBase = Omit<
  DesktopPanelContribution,
  "factory" | "availability" | "side"
>;

/** Left-side contribution with factory narrowed to {@link LeftPanelContext}. */
export type LeftPanelContribution = DesktopPanelContributionBase & {
  readonly side: "left";
  readonly factory: PanelFactory<ReactNode, LeftPanelContext>;
  readonly availability?: (context: LeftPanelContext) => boolean;
};

/** Right-side contribution with factory narrowed to {@link RightPanelContext}. */
export type RightPanelContribution = DesktopPanelContributionBase & {
  readonly side: "right";
  readonly factory: PanelFactory<ReactNode, RightPanelContext>;
  readonly availability?: (context: RightPanelContext) => boolean;
};

/**
 * First-party panels in activity-bar/title-bar order. Typed as a union of
 * side-narrowed contributions so each literal is compile-checked against its
 * own side's context — cross-side field access is an error here, not just
 * at the popout. Entries remain assignable to the wide registry type.
 */
export const builtInDesktopPanels: readonly (LeftPanelContribution | RightPanelContribution)[] = [
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

/**
 * Invokes a contribution's React factory with the wide registry context.
 * The side-specific popouts call `contribution.factory(context)` directly
 * for the side-narrowed compile-time check; this helper is for registry
 * internals and tests that don't choose a side.
 */
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

/** Registered left-side panels for activity-bar rendering. Cast is sound: entries were registered narrow. */
export function getLeftPanelContributions(): readonly LeftPanelContribution[] {
  return desktopPanelRegistry.entriesBySide("left") as readonly LeftPanelContribution[];
}

/** Registered right-side panels for title-bar/popout rendering. Cast is sound: entries were registered narrow. */
export function getRightPanelContributions(): readonly RightPanelContribution[] {
  return desktopPanelRegistry.entriesBySide("right") as readonly RightPanelContribution[];
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
  return usePanelContributions("left") as readonly LeftPanelContribution[];
}

/** Live right-side panels for title-bar and popout rendering. */
export function useRightPanelContributions(): readonly RightPanelContribution[] {
  return usePanelContributions("right") as readonly RightPanelContribution[];
}
