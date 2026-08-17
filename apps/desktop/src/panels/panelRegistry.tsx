import {
  createContributionRegistry,
  type ContributionRegistry,
  type PanelContribution,
  type PanelFactory
} from "@thinkbrain/core";
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
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
 * Shape every extension-registered panel id is guaranteed to have.
 *
 * `desktopExtensionHost.ts`'s `prefixId` and `bootstrap.ts`'s lazy stub
 * registration both construct panel ids as `` `${extensionId}.${localId}` ``
 * with no other path into the registry, so "contains a dot" is a real
 * invariant, not a convention — unlike the generic `(string & {})` escape
 * hatch, this rejects a plain typo (`"exlorer"` has no dot) at compile time
 * while still admitting any id an extension actually registers.
 */
export type ExtensionPanelId = `${string}.${string}`;

/**
 * Activity-bar panel id selected on the left side of the shell.
 *
 * Admits extension-registered panel ids (e.g. the journal extension's
 * `"journal-calendar.journal"` id) via {@link ExtensionPanelId} — extension
 * panels are selectable shell state today (see `ActivityBar`) — while still
 * rejecting a misspelled built-in (`"exlorer"`) at compile time, unlike a bare
 * `(string & {})` widening would.
 */
export type LeftPanel = BuiltInLeftPanel | ExtensionPanelId;

/**
 * Title-bar panel id selected on the right side of the shell.
 *
 * See {@link LeftPanel} for the rationale.
 */
export type RightPanel = BuiltInRightPanel | ExtensionPanelId;

/**
 * Runtime guard narrowing an arbitrary id to a built-in left panel id.
 *
 * `LeftPanel` itself now admits extension ids via {@link ExtensionPanelId}, so
 * this guard is for call sites that specifically need "is this one of the
 * fixed first-party panels" (e.g. distinguishing a built-in from an extension
 * panel), not for gating extension ids out of shell state.
 */
export function isBuiltInLeftPanel(id: string): id is BuiltInLeftPanel {
  return id === "explorer"
    || id === "search"
    || id === "tags"
    || id === "extensions";
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

/** Base for side-narrowed contribution types (omits side-specific id/factory/availability). */
type DesktopPanelContributionBase = Omit<
  DesktopPanelContribution,
  "id" | "factory" | "availability" | "side"
>;

/**
 * Left-side contribution with `id` and factory narrowed to {@link LeftPanel}
 * / {@link LeftPanelContext}.
 *
 * Narrowing `id` (rather than inheriting the wide {@link DesktopPanelId})
 * is what lets `ActivityBar` pass a registered contribution's id straight
 * into `onSelectLeftPanel` and have the narrow {@link LeftPanel} shell-state
 * type accept it without a cast — the registry itself is the proof the id is
 * a real built-in or extension id, not an unchecked string.
 */
export type LeftPanelContribution = DesktopPanelContributionBase & {
  readonly id: LeftPanel;
  readonly side: "left";
  readonly factory: PanelFactory<ReactNode, LeftPanelContext>;
  readonly availability?: (context: LeftPanelContext) => boolean;
};

/** Right-side contribution with `id` and factory narrowed to {@link RightPanel} / {@link RightPanelContext}. See {@link LeftPanelContribution} for the rationale. */
export type RightPanelContribution = DesktopPanelContributionBase & {
  readonly id: RightPanel;
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
 * Render-safe lookup that returns the contribution or `undefined` instead of
 * throwing. Use this in React render paths so an unregistered id degrades to a
 * fallback instead of unmounting the shell.
 */
export function getDesktopPanelOrUndefined(
  id: DesktopPanelId
): DesktopPanelContribution | undefined {
  return desktopPanelRegistry.get(id);
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

/**
 * One panel's slot. A kept-mounted panel keeps its DOM and state; it just
 * toggles `hidden` when its neighbour is the one being opened. Shared by both
 * popouts since the shape is identical (only the context type differs).
 * Not memoized: `React.memo` collapses generic type parameters, and the
 * popouts already memoize the context object so re-renders are bounded.
 */
export function MountedPanel<Ctx extends LeftPanelContext | RightPanelContext>({
  contribution,
  context,
  isActive,
  isAvailable
}: {
  readonly contribution: { readonly factory: (ctx: Ctx) => ReactNode };
  readonly context: Ctx;
  readonly isActive: boolean;
  readonly isAvailable: boolean;
}) {
  return (
    <div
      className={isActive ? "flex min-h-0 flex-1 flex-col" : "hidden"}
      data-panel-available={isAvailable}
    >
      {contribution.factory(context)}
    </div>
  );
}
