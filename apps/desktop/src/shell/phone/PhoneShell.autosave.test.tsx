// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  openReadyNote,
  renderWithShell,
  unmount,
  writeMock
} from "./PhoneShell.testHarness";

describe("PhoneShell autosave", () => {
  it("autosaves a dirty document after 1.5s of inactivity", async () => {
    const { shell } = await renderWithShell();
    const tabId = await openReadyNote(shell);
    vi.useFakeTimers();

    await act(async () => shell().updateDocument(tabId, "edited text"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400);
    });
    expect(writeMock()).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(writeMock()).toHaveBeenCalledOnce();
  });

  it("resets the autosave timer when typing continues", async () => {
    const { shell } = await renderWithShell();
    const tabId = await openReadyNote(shell);
    vi.useFakeTimers();

    await act(async () => shell().updateDocument(tabId, "first edit"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400);
    });
    expect(writeMock()).not.toHaveBeenCalled();

    await act(async () => shell().updateDocument(tabId, "second edit"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400);
    });
    expect(writeMock()).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(writeMock()).toHaveBeenCalledOnce();
  });

  it("cancels a pending autosave when switching tabs", async () => {
    const { shell } = await renderWithShell();
    const firstId = await openReadyNote(shell, "note.md");
    await openReadyNote(shell, "other.md");
    await act(async () => shell().dispatchTabs({ type: "activate", tabId: firstId }));
    vi.useFakeTimers();

    await act(async () => shell().updateDocument(firstId, "edited, then left"));
    await act(async () => shell().dispatchTabs({ type: "activate", tabId: shell().tabState.tabs[1]!.id }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(writeMock()).not.toHaveBeenCalled();
  });

  it("does not autosave a document that is not dirty", async () => {
    const { shell } = await renderWithShell();
    await openReadyNote(shell);
    vi.useFakeTimers();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(writeMock()).not.toHaveBeenCalled();
  });

  it("cancels a pending autosave on unmount", async () => {
    const { shell } = await renderWithShell();
    const tabId = await openReadyNote(shell);
    vi.useFakeTimers();

    await act(async () => shell().updateDocument(tabId, "edited then left the shell"));
    await unmount();
    await vi.advanceTimersByTimeAsync(2000);

    expect(writeMock()).not.toHaveBeenCalled();
  });
});
