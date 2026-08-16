import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { LeftPopout } from "./LeftPopout";
import { RightPopout } from "./RightPopout";
import {
  builtInDesktopPanels,
  createDesktopPanelRegistry,
  desktopPanelRegistry,
  getDesktopPanelOrUndefined,
  isBuiltInLeftPanel,
  type BuiltInLeftPanel,
  type BuiltInRightPanel,
  type DesktopPanelContext,
  type DesktopPanelContribution,
  type LeftPanel,
  type LeftPanelContribution,
  type LeftPanelContext,
  type RightPanel,
  type RightPanelContribution,
  type RightPanelContext
} from "./panelRegistry";

const explorerProps: DesktopPanelContext["explorerProps"] = {
  initialWorkspacePath: null,
  onWorkspaceOpened: () => undefined,
  onWorkspaceUnavailable: () => undefined,
  onMarkdownFileSelected: () => undefined,
  onMarkdownFileCreated: () => undefined,
  onNewNoteFocusHandled: () => undefined,
  newNoteFocusRequest: 0,
  recentWorkspacePaths: [],
  onWorkspaceLaunched: () => undefined
};

/**
 * The wide registry-internal context. Kept for the registry-wide API
 * (`isAvailable`, `renderDesktopPanel`); the side-specific popouts and
 * factories use {@link leftContext}/{@link rightContext} instead.
 */
const context: DesktopPanelContext = {
  rootPath: null,
  documentContents: null,
  explorerProps,
  onOpenSearchResult: () => undefined
};

/** Only the state a left-side factory may read. */
const leftContext: LeftPanelContext = {
  rootPath: "/notes",
  explorerProps,
  onOpenSearchResult: () => undefined
};

/** Only the state a right-side factory may read. */
const rightContext: RightPanelContext = {
  rootPath: "/notes",
  documentContents: "# Hello"
};

/** Minimal spy contribution with a side and factory. */
function spyContribution<Side extends "left" | "right">(
  id: string,
  side: Side,
  factory: (ctx: Side extends "left" ? LeftPanelContext : RightPanelContext) => ReactNode
): Side extends "left" ? LeftPanelContribution : RightPanelContribution {
  return { id, label: id, icon: "x", side, factory } as never;
}

function contribution(
  id: DesktopPanelContribution["id"],
  availability?: DesktopPanelContribution["availability"]
): DesktopPanelContribution {
  return {
    id,
    label: id,
    icon: id,
    side: "left",
    availability,
    factory: () => <span>{id}</span>
  };
}

describe("desktop panel registry", () => {
  it("registers built-ins in the existing left and right display order", () => {
    expect(builtInDesktopPanels.map((panel) => panel.id)).toEqual([
      "explorer",
      "search",
      "source-control",
      "tags",
      "extensions",
      "outline",
      "backlinks",
      "properties",
      "assistant"
    ]);
    expect(desktopPanelRegistry.entriesBySide("left").map((panel) => panel.id)).toEqual([
      "explorer",
      "search",
      "source-control",
      "tags",
      "extensions"
    ]);
    expect(desktopPanelRegistry.entriesBySide("right").map((panel) => panel.id)).toEqual([
      "outline",
      "backlinks",
      "properties",
      "assistant"
    ]);
  });

  it("looks up registered panels and reports missing ids", () => {
    expect(desktopPanelRegistry.get("outline")?.label).toBe("Outline");
    expect(desktopPanelRegistry.get("missing")).toBeUndefined();
    expect(desktopPanelRegistry.isAvailable("outline", context)).toBe(true);
    expect(desktopPanelRegistry.isAvailable("tags", context)).toBe(false);
    expect(desktopPanelRegistry.isAvailable("missing", context)).toBe(false);
  });

  it("evaluates availability against the supplied context", () => {
    const registry = createDesktopPanelRegistry([
      contribution("explorer", ({ rootPath }) => rootPath !== null)
    ]);
    expect(registry.isAvailable("explorer", context)).toBe(false);
    expect(registry.isAvailable("explorer", { ...context, rootPath: "/notes" })).toBe(true);
  });

  it("fails loudly when a panel id is registered twice", () => {
    const registry = createDesktopPanelRegistry([]);
    registry.register(contribution("tags"));
    expect(() => registry.register(contribution("tags"))).toThrow(
      'A contribution is already registered for id "tags".'
    );
  });

  it("renders a panel through its typed React factory", () => {
    const panel = contribution("search");
    expect(renderToStaticMarkup(panel.factory(context))).toBe("<span>search</span>");
  });

  it("drives left and right popout rendering from registered contributions", () => {
    const leftMarkup = renderToStaticMarkup(
      <LeftPopout
        panel="tags"
        rootPath={null}
        explorerProps={context.explorerProps}
        onOpenSearchResult={context.onOpenSearchResult}
      />
    );
    const rightMarkup = renderToStaticMarkup(
      <RightPopout panel="backlinks" rootPath={null} documentContents={null} />
    );

    expect(leftMarkup).toContain("Tags");
    expect(leftMarkup).toContain("Tags will appear here once note indexing is available.");
    expect(rightMarkup).toContain("Backlinks unavailable");
    expect(rightMarkup).toContain("This inspector activates after the workspace link index is available.");
  });

  it("returns undefined for an unknown id via the render-safe lookup", () => {
    expect(getDesktopPanelOrUndefined("missing")).toBeUndefined();
    expect(getDesktopPanelOrUndefined("outline")?.label).toBe("Outline");
  });

  it("filters entriesBySide so each side excludes the other", () => {
    const registry = createDesktopPanelRegistry([
      { ...contribution("left-a"), side: "left" },
      { ...contribution("left-b"), side: "left" },
      { ...contribution("right-a"), side: "right" },
      { ...contribution("right-b"), side: "right" }
    ]);
    expect(registry.entriesBySide("left").map((p) => p.id)).toEqual(["left-a", "left-b"]);
    expect(registry.entriesBySide("right").map((p) => p.id)).toEqual(["right-a", "right-b"]);
    expect(registry.entriesBySide("left").every((p) => p.side === "left")).toBe(true);
    expect(registry.entriesBySide("right").every((p) => p.side === "right")).toBe(true);
  });

  it("accepts extension-owned string ids for registration and lookup without making them selectable shell state", () => {
    const registry = createDesktopPanelRegistry([]);
    const extensionPanel: DesktopPanelContribution = {
      id: "extension.calendar",
      label: "Calendar",
      icon: "▦",
      side: "left",
      factory: () => <span>calendar</span>
    };
    registry.register(extensionPanel);

    // Wide registry lookup resolves the extension-owned id on the registry it
    // was registered against. The shared module-level registry does not know
    // about it, demonstrating that extension lookup is per-registry and does
    // not leak into shell selection state.
    expect(registry.get("extension.calendar")?.label).toBe("Calendar");
    expect(getDesktopPanelOrUndefined("extension.calendar")?.label).toBeUndefined();
    // The extension id is not a built-in left panel, so it cannot narrow
    // to selectable shell state.
    expect(isBuiltInLeftPanel("extension.calendar")).toBe(false);
  });

  it("narrows built-in left ids via the type guard", () => {
    for (const id of ["explorer", "search", "source-control", "tags", "extensions"] as const) {
      expect(isBuiltInLeftPanel(id)).toBe(true);
    }
    expect(isBuiltInLeftPanel("outline")).toBe(false);
  });

  // Type-level fixtures: misspelled built-in ids must be rejected by the
  // narrow built-in unions. `LeftPanel`/`RightPanel` are wide (they accept
  // extension-owned string ids), so the compile-time check uses the narrow
  // `BuiltInLeftPanel`/`BuiltInRightPanel` types directly.
  it("rejects misspelled built-in ids at compile time", () => {
    // @ts-expect-error — "exlorer" is not a valid BuiltInLeftPanel.
    const _badLeft: BuiltInLeftPanel = "exlorer";
    // @ts-expect-error — "propeties" is not a valid BuiltInRightPanel.
    const _badRight: BuiltInRightPanel = "propeties";
    // @ts-expect-error — "outline" is a right panel, not a left panel.
    const _crossToLeft: BuiltInLeftPanel = "outline";
    // @ts-expect-error — "explorer" is a left panel, not a right panel.
    const _crossToRight: BuiltInRightPanel = "explorer";

    // Reference the bindings so they are not flagged as unused.
    void _badLeft;
    void _badRight;
    void _crossToLeft;
    void _crossToRight;
    expect(true).toBe(true);
  });

  // Type-level fixtures for the shell-selection unions themselves. Unlike a
  // bare `(string & {})` widening, `LeftPanel`/`RightPanel` still reject a
  // misspelled built-in — `setLeftPanel("exlorer")` must not compile — while
  // admitting a real extension id (which is always "extensionId.localId" per
  // `prefixId` in desktopExtensionHost.ts), so `ActivityBar` can keep passing
  // a registered contribution's id straight into shell state.
  it("rejects a misspelled built-in as LeftPanel/RightPanel shell state, but admits an extension id", () => {
    // @ts-expect-error — "exlorer" is neither a built-in nor "x.y"-shaped.
    const _badLeft: LeftPanel = "exlorer";
    // @ts-expect-error — "propeties" is neither a built-in nor "x.y"-shaped.
    const _badRight: RightPanel = "propeties";
    const _extensionLeft: LeftPanel = "journal-calendar.journal";
    const _extensionRight: RightPanel = "note-stats.stats";

    void _badLeft;
    void _badRight;
    void _extensionLeft;
    void _extensionRight;
    expect(true).toBe(true);
  });

  // Type-level fixtures for the side-narrowed contexts: a right-side factory
  // that destructures `explorerProps` (or `onOpenSearchResult`) and a left-side
  // factory that destructures `documentContents` must be compile errors. This
  // is the core guarantee of the context split — a future panel cannot silently
  // reach across sides.
  it("rejects cross-side context access in side-narrowed factories at compile time", () => {
    // Ids use the "extension.local" shape (not a bare built-in) so they also
    // exercise the narrowed `RightPanelContribution`/`LeftPanelContribution`
    // id type alongside the context-access check below.
    const _badRightFactory: RightPanelContribution = {
      id: "test.bad-right",
      label: "bad",
      icon: "x",
      side: "right",
      // @ts-expect-error — RightPanelContext has no explorerProps; right
      // factories must not see left-side explorer state.
      factory: ({ explorerProps: _explorer }) => <span>{String(_explorer)}</span>
    };
    const _badRightSearch: RightPanelContribution = {
      id: "test.bad-right-search",
      label: "bad",
      icon: "x",
      side: "right",
      // @ts-expect-error — RightPanelContext has no onOpenSearchResult; right
      // factories must not see left-side search callbacks.
      factory: ({ onOpenSearchResult: _open }) => <span>{String(_open)}</span>
    };
    const _badLeftFactory: LeftPanelContribution = {
      id: "test.bad-left",
      label: "bad",
      icon: "x",
      side: "left",
      // @ts-expect-error — LeftPanelContext has no documentContents; left
      // factories must not see right-side document state.
      factory: ({ documentContents: _doc }) => <span>{String(_doc)}</span>
    };

    void _badRightFactory;
    void _badRightSearch;
    void _badLeftFactory;
    expect(true).toBe(true);
  });

  it("passes the side-narrowed context to each side's factory at runtime", () => {
    const seenLeft: LeftPanelContext[] = [];
    const seenRight: RightPanelContext[] = [];

    const leftSpy = spyContribution("left-spy", "left", (ctx) => {
      seenLeft.push(ctx);
      return <span>left</span>;
    });
    const rightSpy = spyContribution("right-spy", "right", (ctx) => {
      seenRight.push(ctx);
      return <span>right</span>;
    });

    // The side-narrowed factories are invoked directly with their matching
    // context — the same way the popouts call `contribution.factory(context)`.
    expect(renderToStaticMarkup(leftSpy.factory(leftContext))).toBe("<span>left</span>");
    expect(renderToStaticMarkup(rightSpy.factory(rightContext))).toBe("<span>right</span>");

    expect(seenLeft).toEqual([leftContext]);
    expect(seenRight).toEqual([rightContext]);
    // The left spy must not have received documentContents, and the right spy
    // must not have received explorerProps / onOpenSearchResult.
    expect("documentContents" in seenLeft[0]!).toBe(false);
    expect("explorerProps" in seenRight[0]!).toBe(false);
    expect("onOpenSearchResult" in seenRight[0]!).toBe(false);
  });

  it("renders the side-narrowed factories through the wide registry context", () => {
    const leftSpy = spyContribution("left-wide", "left", ({ rootPath }) => <span>{rootPath}</span>);
    const rightSpy = spyContribution("right-wide", "right", ({ documentContents }) => <span>{documentContents}</span>);
    expect(
      renderToStaticMarkup(leftSpy.factory({ ...context, rootPath: "/notes" }))
    ).toBe("<span>/notes</span>");
    expect(
      renderToStaticMarkup(rightSpy.factory({ ...context, documentContents: "doc" }))
    ).toBe("<span>doc</span>");
  });
});
