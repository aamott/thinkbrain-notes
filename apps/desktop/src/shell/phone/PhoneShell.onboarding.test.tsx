// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it } from "vitest";

// The harness must be the first import: its `vi.mock("../../native/commands")`
// registers when the harness module evaluates.
import { filesVisible, mockManagedWorkspaceAccess, renderWithShell } from "./PhoneShell.testHarness";

// The switching controller and its dialogs live at shell level, so the
// landing tab's actions reach them without routing through the Files surface.
describe("workspace onboarding on the phone", () => {
  it("offers managed-vault entry points on the landing tab, not note actions", async () => {
    mockManagedWorkspaceAccess();
    const { host, shell } = await renderWithShell();

    await act(async () => shell().openNewTab());

    // Scoped to the landing page so the hidden explorer's empty-state
    // buttons cannot stand in for it.
    const labels = [
      ...(host.querySelector(".bg-editor")?.querySelectorAll<HTMLButtonElement>("button") ?? [])
    ].map((button) => button.textContent);
    expect(labels.some((label) => label?.includes("Create vault"))).toBe(true);
    expect(labels.some((label) => label?.includes("Bring in from Git link"))).toBe(true);
    expect(labels.some((label) => label?.includes("New note"))).toBe(false);
  });

  it("opens the shell-level create-vault dialog without leaving the tab", async () => {
    mockManagedWorkspaceAccess();
    const { host, shell } = await renderWithShell();

    await act(async () => shell().openNewTab());
    // Under the tab route the Files surface stays mounted but hidden — the
    // dialog no longer needs it revealed.
    expect(filesVisible(host)).toBe(false);

    // Scoped to the landing page — the hidden explorer's empty state offers
    // the same label.
    await act(async () => {
      [...(host.querySelector(".bg-editor")?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
        .find((button) => button.textContent?.includes("Create vault"))
        ?.click();
    });

    expect(filesVisible(host)).toBe(false);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
