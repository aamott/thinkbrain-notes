import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../settings/ThemeProvider";
import { DesktopShell } from "./DesktopShell";
import { StatusBar } from "./StatusBar";
import { leftActions } from "./shellTypes";

/**
 * Renders the shell to static markup.
 *
 * `renderToStaticMarkup` skips effects and DOM APIs, so the shell renders in
 * its pre-boot, non-Tauri state (`isTauri()` is false under Node). That is
 * exactly the composition we want to assert: chrome present, no workspace.
 *
 * The shell consumes `useTheme()` from {@link ThemeProvider}, so it must be
 * wrapped in the provider — otherwise the hook throws outside its context.
 */
function shellMarkup(): string {
  return renderToStaticMarkup(
    <ThemeProvider>
      <DesktopShell />
    </ThemeProvider>
  );
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
    // Active buttons emit aria-current between aria-label and title, so assert
    // each attribute independently rather than as a contiguous substring.
    for (const action of leftActions) {
      expect(markup).toContain(`aria-label="${action.label}"`);
      expect(markup).toContain(`title="${action.label}"`);
    }
    expect(leftActions).toHaveLength(5);
    expect(markup).toContain('aria-label="Settings"');
    expect(markup).toContain('title="Settings"');
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
    expect(markup).toContain('aria-label="Notifications"');
  });

  it("shows the workspace name in the status bar once a workspace is open", () => {
    const markup = renderToStaticMarkup(
      <StatusBar workspaceName="Field Notes" />
    );

    expect(markup).toContain(">Field Notes</span>");
    expect(markup).toContain("Workspace open");
    expect(markup).not.toContain("No workspace open");
  });

  it("exposes the notifications bell's popover state to assistive technology", () => {
    const closed = renderToStaticMarkup(
      <StatusBar workspaceName={null} />
    );

    // The bell button is collapsed by default.
    expect(closed).toContain('aria-label="Notifications"');
    expect(closed).toContain('aria-expanded="false"');
  });

  it("renders the explorer panel by default with aria-current on its activity button", () => {
    const markup = shellMarkup();

    expect(markup).toContain('aria-label="Explorer panel"');
    // IconButton emits aria-current between aria-label and title when active.
    expect(markup).toContain('aria-label="Explorer" aria-current="true" title="Explorer"');
  });

  it("does not render the search panel when explorer is active", () => {
    const markup = shellMarkup();

    // The left popout aside landmark is scoped to the active panel.
    expect(markup).not.toContain('aria-label="Search panel"');
    // The SearchPanel section landmark is only rendered when search is active.
    expect(markup).not.toContain('<section aria-label="Search"');
  });

  it("renders the settings activity button without aria-current", () => {
    const markup = shellMarkup();

    expect(markup).toContain('aria-label="Settings" title="Settings"');
    expect(markup).not.toContain('aria-label="Settings" title="Settings" aria-current');
  });
});
