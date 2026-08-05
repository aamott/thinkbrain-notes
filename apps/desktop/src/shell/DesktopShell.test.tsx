import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DesktopShell } from "./DesktopShell";
import { StatusBar } from "./StatusBar";
import { leftActions } from "./shellTypes";

/**
 * Renders the shell to static markup.
 *
 * `renderToStaticMarkup` skips effects and DOM APIs, so the shell renders in
 * its pre-boot, non-Tauri state (`isTauri()` is false under Node). That is
 * exactly the composition we want to assert: chrome present, no workspace.
 */
function shellMarkup(): string {
  return renderToStaticMarkup(<DesktopShell />);
}

describe("DesktopShell composition", () => {
  it("renders the shell landmark with its accessible name", () => {
    const markup = shellMarkup();

    expect(markup).toContain("<main");
    expect(markup).toContain('aria-label="ThinkBrain desktop workspace"');
  });

  it("renders the title bar with the app name and tab strip landmark", () => {
    const markup = shellMarkup();

    expect(markup).toContain(">ThinkBrain</span>");
    expect(markup).toContain('aria-label="Open tabs"');
  });

  it("renders every activity bar action as a labelled icon button", () => {
    const markup = shellMarkup();

    expect(markup).toContain('aria-label="Workspace sections"');
    for (const action of leftActions) {
      expect(markup).toContain(`aria-label="${action.label}" title="${action.label}"`);
    }
    expect(leftActions).toHaveLength(5);
    expect(markup).toContain('aria-label="Settings" title="Settings"');
  });

  it("keeps the editor region and both dock landmarks in the layout", () => {
    const markup = shellMarkup();

    expect(markup).toContain('aria-label="Note workspace"');
    expect(markup).toContain('aria-label="Explorer panel"');
    expect(markup).toContain('aria-label="Outline panel"');
    expect(markup).toContain('aria-label="Resize left panel. Use arrow keys to resize."');
    expect(markup).toContain('aria-label="Resize right panel. Use arrow keys to resize."');
  });

  it("reports an empty workspace in the status bar before a workspace is opened", () => {
    const markup = shellMarkup();

    expect(markup).toContain("No workspace open");
    expect(markup).toContain("Open a workspace to begin");
    expect(markup).toContain('aria-label="Toggle bottom panel"');
  });

  it("shows the workspace name in the status bar once a workspace is open", () => {
    const markup = renderToStaticMarkup(
      <StatusBar workspaceName="Field Notes" bottomPanel={null} onToggleBottomPanel={() => undefined} />
    );

    expect(markup).toContain(">Field Notes</span>");
    expect(markup).toContain("Workspace open");
    expect(markup).not.toContain("No workspace open");
  });
});
