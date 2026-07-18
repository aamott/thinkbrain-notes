import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceControlPanelContent, type SourceControlPanelState } from "./SourceControlPanel";
import { createSourceControlRequestGate } from "./sourceControlRequestGate";

describe("SourceControlPanel content", () => {
  it("renders an accessible repository branch and initialization action", () => {
    const repository: SourceControlPanelState = {
      kind: "repository",
      branch: "feature/notes",
      status: { staged: [], changed: [], untracked: [] }
    };
    const notRepository: SourceControlPanelState = { kind: "not-repository" };

    expect(renderToStaticMarkup(<SourceControlPanelContent state={repository} />)).toContain(
      "<dd>feature/notes</dd>"
    );
    const markup = renderToStaticMarkup(
      <SourceControlPanelContent onInitialize={() => undefined} state={notRepository} />
    );

    expect(markup).toContain("This workspace is not a Git repository.");
    expect(markup).toContain(">Initialize repository</button>");
    expect(markup).not.toContain("disabled");
  });

  it("announces loading and errors", () => {
    const loading: SourceControlPanelState = { kind: "loading" };
    const error: SourceControlPanelState = { kind: "error", message: "Could not connect." };

    expect(renderToStaticMarkup(<SourceControlPanelContent state={loading} />)).toContain('role="status"');
    expect(renderToStaticMarkup(<SourceControlPanelContent state={error} />)).toContain('role="alert"');
  });

  it("renders no-workspace and Git-missing states with actionable copy", () => {
    const noWorkspace: SourceControlPanelState = { kind: "no-workspace" };
    const missing: SourceControlPanelState = { kind: "git-missing", message: "Git is not installed." };

    expect(renderToStaticMarkup(<SourceControlPanelContent state={noWorkspace} />)).toContain("Open a workspace");
    expect(renderToStaticMarkup(<SourceControlPanelContent state={missing} />)).toContain("Git is not installed.");
  });

  it("announces initializing, successful, and failed initialization without false success", () => {
    const initializing: SourceControlPanelState = { kind: "initializing" };
    const successful: SourceControlPanelState = {
      kind: "repository",
      branch: "main",
      status: { staged: [], changed: [], untracked: [] },
      initialized: true
    };
    const failed: SourceControlPanelState = {
      kind: "initialize-error",
      message: "The repository could not be initialized. Please try again."
    };

    expect(renderToStaticMarkup(<SourceControlPanelContent state={initializing} />)).toContain(
      "Creating the Git repository…"
    );
    expect(renderToStaticMarkup(<SourceControlPanelContent state={successful} />)).toContain(
      "Repository initialized."
    );

    const failedMarkup = renderToStaticMarkup(
      <SourceControlPanelContent onInitialize={() => undefined} state={failed} />
    );
    expect(failedMarkup).toContain('role="alert"');
    expect(failedMarkup).toContain("The repository could not be initialized. Please try again.");
    expect(failedMarkup).not.toContain("Repository initialized.");
  });

  it("groups staged, changed, and untracked files with an explicit refresh action", () => {
    const state: SourceControlPanelState = {
      kind: "repository",
      branch: "main",
      status: {
        staged: [{ path: "notes/ready.md", indexStatus: "M", worktreeStatus: " " }],
        changed: [{ path: "notes/editing.md", indexStatus: " ", worktreeStatus: "M" }],
        untracked: [{ path: "notes/new.md", indexStatus: "?", worktreeStatus: "?" }]
      }
    };

    const markup = renderToStaticMarkup(
      <SourceControlPanelContent onRefresh={() => undefined} state={state} />
    );

    expect(markup).toContain("Staged");
    expect(markup).toContain("Changed");
    expect(markup).toContain("Untracked");
    expect(markup).toContain("notes/ready.md");
    expect(markup).toContain('aria-label="Refresh Git changes"');
  });

  it("does not allow stale async work to replace a newer source-control request", () => {
    const gate = createSourceControlRequestGate();
    const first = gate.begin();
    const second = gate.begin();

    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
  });
});
