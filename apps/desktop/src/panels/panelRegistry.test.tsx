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
  renderDesktopPanel,
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
});
