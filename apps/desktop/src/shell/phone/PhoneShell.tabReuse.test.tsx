// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

// The harness must be the first import: its `vi.mock("../../native/commands")`
// registers when the harness module evaluates.
import { click, renderWithShell, visibleDialog } from "./PhoneShell.testHarness";
import { workspaceDocumentApi } from "../../workspace/workspaceDocumentAdapter";

/**
 * What this file tests is the callbacks PhoneShell hands the explorer, so a
 * probe that fires the selection callbacks for fixed paths keeps the wiring
 * honest without faking a filesystem.
 */
vi.mock("../../workspace/WorkspaceExplorer", () => ({
  WorkspaceExplorer: (props: {
    onMarkdownFileSelected?: (rootPath: string, relativePath: string) => void;
    onFileSelected?: (rootPath: string, relativePath: string) => void;
  }) => (
    <>
      <button
        aria-label="Probe note a.md"
        onClick={() => props.onMarkdownFileSelected?.("/vault", "a.md")}
      />
      <button
        aria-label="Probe note b.md"
        onClick={() => props.onMarkdownFileSelected?.("/vault", "b.md")}
      />
      <button
        aria-label="Probe file song.mp3"
        onClick={() => props.onFileSelected?.("/vault", "song.mp3")}
      />
    </>
  )
}));

const tap = async (host: HTMLDivElement, label: string): Promise<void> => {
  const button = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  if (!button) throw new Error(`Probe "${label}" was not rendered.`);
  await act(async () => button.click());
};

describe("one-tab file opening on the phone", () => {
  it("reuses the on-screen tab for each file tap", async () => {
    const { host, shell } = await renderWithShell();

    await tap(host, "Probe note a.md");
    await tap(host, "Probe note b.md");

    // The file tap filled the tab the user was looking at rather than
    // stacking a second one.
    expect(shell().tabState.tabs).toHaveLength(1);
    expect(shell().tabState.tabs[0]?.resource?.relativePath).toBe("b.md");
    expect(shell().tabState.activeTabId).toBe(shell().tabState.tabs[0]?.id);
  });

  it("saves a dirty tab before replacing it", async () => {
    const { host, shell } = await renderWithShell();
    await tap(host, "Probe note a.md");
    const tabId = shell().tabState.tabs[0]!.id;
    await act(async () => shell().updateDocument(tabId, "edited just now"));

    await tap(host, "Probe note b.md");

    expect(vi.mocked(workspaceDocumentApi.writeMarkdownDocument)).toHaveBeenCalled();
    expect(shell().tabState.tabs).toHaveLength(1);
    expect(shell().tabState.tabs[0]?.resource?.relativePath).toBe("b.md");
  });

  it("appends instead of displacing edits when the save cannot land", async () => {
    const { host, shell } = await renderWithShell();
    await tap(host, "Probe note a.md");
    const tabId = shell().tabState.tabs[0]!.id;
    await act(async () => shell().updateDocument(tabId, "unsaved work"));
    vi.mocked(workspaceDocumentApi.writeMarkdownDocument).mockRejectedValueOnce(
      new Error("disk full")
    );

    await tap(host, "Probe note b.md");

    const tabs = shell().tabState.tabs;
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.id).toBe(tabId);
    // The tab that could not be replaced kept its edits.
    expect(shell().documents[tabId]?.contents).toBe("unsaved work");
    expect(tabs[0]?.isDirty).toBe(true);
  });

  it("opens a blank new tab from the switcher's trailing card and navigates to it", async () => {
    const { host, shell } = await renderWithShell();
    await tap(host, "Probe note a.md");

    await click(host, "Open tabs (1)");
    const card = visibleDialog(host, "Open tabs")?.querySelector<HTMLButtonElement>(
      '[aria-label="New tab"]'
    );
    expect(card).not.toBeNull();
    await act(async () => card!.click());

    const newTab = shell().tabState.tabs.find((tab) => tab.kind === "new-tab");
    expect(newTab).toBeDefined();
    expect(shell().tabState.activeTabId).toBe(newTab?.id);
    // The landing page's entry points rendered.
    expect(host.textContent).toContain("New note");
    expect(host.textContent).toContain("Browse files");
  });

  it("the new-tab page's file action reaches the Files route", async () => {
    const { host, shell } = await renderWithShell();

    await act(async () => shell().openNewTab());
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("Browse files"))
        ?.click();
    });

    // Landing on Files leaves the new tab behind for a file tap to fill.
    expect(host.querySelector('[aria-label="Files panel"]')).not.toBeNull();
    await tap(host, "Probe note a.md");
    expect(shell().tabState.tabs.filter((tab) => tab.kind === "new-tab")).toHaveLength(0);
    expect(shell().tabState.tabs).toHaveLength(1);
  });
});
