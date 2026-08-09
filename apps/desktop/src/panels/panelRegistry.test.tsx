import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LeftPopout } from "./LeftPopout";
import { RightPopout } from "./RightPopout";
import {
  builtInDesktopPanels,
  createDesktopPanelRegistry,
  desktopPanelRegistry,
  getDesktopPanelOrUndefined,
  getLeftPanelContributions,
  getRightPanelContributions,
  isBuiltInLeftPanel,
  isBuiltInRightPanel,
  renderDesktopPanel,
  type BuiltInLeftPanel,
  type BuiltInRightPanel,
  type DesktopPanelContext,
  type DesktopPanelContribution
} from "./panelRegistry";

const context: DesktopPanelContext = {
  rootPath: null,
  documentContents: null,
  explorerProps: {
    initialWorkspacePath: null,
    onWorkspaceOpened: () => undefined,
    onWorkspaceUnavailable: () => undefined,
    onMarkdownFileSelected: () => undefined,
    onMarkdownFileCreated: () => undefined,
    onNewNoteFocusHandled: () => undefined,
    newNoteFocusRequest: 0,
    recentWorkspacePaths: [],
    onWorkspaceLaunched: () => undefined
  },
  onOpenSearchResult: () => undefined
};

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
    expect(getLeftPanelContributions().map((panel) => panel.id)).toEqual([
      "explorer",
      "search",
      "source-control",
      "tags",
      "extensions"
    ]);
    expect(getRightPanelContributions().map((panel) => panel.id)).toEqual([
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
    expect(renderToStaticMarkup(renderDesktopPanel(panel, context))).toBe("<span>search</span>");
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
    // The extension id is not a built-in left/right panel, so it cannot narrow
    // to selectable shell state.
    expect(isBuiltInLeftPanel("extension.calendar")).toBe(false);
    expect(isBuiltInRightPanel("extension.calendar")).toBe(false);
  });

  it("narrows built-in side ids via the type guards", () => {
    for (const id of ["explorer", "search", "source-control", "tags", "extensions"] as const) {
      expect(isBuiltInLeftPanel(id)).toBe(true);
      expect(isBuiltInRightPanel(id)).toBe(false);
    }
    for (const id of ["outline", "backlinks", "properties", "assistant"] as const) {
      expect(isBuiltInRightPanel(id)).toBe(true);
      expect(isBuiltInLeftPanel(id)).toBe(false);
    }
    expect(isBuiltInLeftPanel("outline")).toBe(false);
    expect(isBuiltInRightPanel("explorer")).toBe(false);
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
});
