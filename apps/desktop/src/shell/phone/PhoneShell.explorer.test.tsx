// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

// The harness must be the first import: its `vi.mock("../../native/commands")`
// registers when the harness module evaluates, and `panelRegistryModel`
// transitively loads `workspaceAdapter` → `native/commands`.
import { inspector, renderWithShell } from "./PhoneShell.testHarness";
import { invokeNativeCommand } from "../../native/commands";

// The harness installs a bare `vi.fn`; grab it back loosely typed so the
// implementation can answer per command.
const nativeCommands = invokeNativeCommand as unknown as {
  mockImplementation: (fn: (command: string) => Promise<unknown>) => void;
};

/**
 * The real explorer's file tree needs a live workspace listing, which the
 * harness deliberately does not fake. What this file tests is the callback
 * PhoneShell hands the explorer, so a stub that fires "Previous versions…"
 * for fixed paths keeps the wiring honest without faking a filesystem.
 */
vi.mock("../../workspace/WorkspaceExplorer", () => ({
  WorkspaceExplorer: (props: {
    onShowVersions?: (rootPath: string, relativePath: string) => void;
  }) => (
    <>
      <button
        aria-label="Probe versions for script.py"
        onClick={() => props.onShowVersions?.("/vault", "script.py")}
      />
      <button
        aria-label="Probe versions for note.md"
        onClick={() => props.onShowVersions?.("/vault", "note.md")}
      />
    </>
  )
}));

const probe = async (host: HTMLDivElement, label: string): Promise<void> => {
  const button = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  if (!button) throw new Error(`Explorer probe "${label}" was not rendered.`);
  await act(async () => button.click());
};

describe("Previous versions… on the phone explorer", () => {
  it("opens a non-Markdown file and raises its Version history inspector", async () => {
    nativeCommands.mockImplementation(async (command: string) => {
      if (command === "read_text_file") {
        return { relative_path: "script.py", contents: "print(1)\n" };
      }
      return null;
    });
    const { host, shell } = await renderWithShell();

    await probe(host, "Probe versions for script.py");

    // The file itself is the content route — inferred kind, pushed onto the
    // stack — and the inspector sits over it, not underneath Files.
    const tab = shell().tabState.tabs.find(
      (candidate) => candidate.resource?.relativePath === "script.py"
    );
    expect(tab?.kind).toBe("code-editor");
    expect(shell().tabState.activeTabId).toBe(tab?.id);
    // The inspector carries the panel — phone chrome does not touch the
    // desktop's rightPanel state.
    expect(inspector(host)).not.toBeNull();
    expect(
      inspector(host)?.querySelector('[aria-label="Version history panel"]')
    ).not.toBeNull();
  });

  it("does the same for a Markdown file in the note editor", async () => {
    const { host, shell } = await renderWithShell();

    await probe(host, "Probe versions for note.md");

    const tab = shell().tabState.tabs.find(
      (candidate) => candidate.resource?.relativePath === "note.md"
    );
    expect(tab?.kind).toBe("editor");
    expect(shell().tabState.activeTabId).toBe(tab?.id);
    expect(
      inspector(host)?.querySelector('[aria-label="Version history panel"]')
    ).not.toBeNull();
  });
});
