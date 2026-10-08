// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it } from "vitest";

// The harness must be the first import: its `vi.mock("../../native/commands")`
// registers when the harness module evaluates.
import { filesVisible, mockManagedWorkspaceAccess, renderWithShell } from "./PhoneShell.testHarness";
import { useWorkspaceOnboardingStore } from "../../workspace/workspaceOnboardingStore";

// The real explorer stays mounted under every route, so the switching
// controller it publishes is what the landing tab's actions reach.
describe("workspace onboarding on the phone", () => {
  it("offers managed-vault entry points on the landing tab, not note actions", async () => {
    mockManagedWorkspaceAccess();
    const { host, shell } = await renderWithShell();

    expect(useWorkspaceOnboardingStore.getState().actions).not.toBeNull();

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

  it("routes to Files before opening an explorer-owned dialog", async () => {
    mockManagedWorkspaceAccess();
    const { host, shell } = await renderWithShell();

    await act(async () => shell().openNewTab());
    // Under the tab route the Files surface stays mounted but hidden.
    expect(filesVisible(host)).toBe(false);

    // Scoped to the landing page — the hidden explorer's empty state offers
    // the same label, and tapping it would open the dialog without routing.
    await act(async () => {
      [...(host.querySelector(".bg-editor")?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
        .find((button) => button.textContent?.includes("Create vault"))
        ?.click();
    });

    expect(filesVisible(host)).toBe(true);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
