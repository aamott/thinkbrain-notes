// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { computeNoteStats, noteStatsManifest } from "./noteStatsModel";
import { activateNoteStats } from "./noteStats";
import { createDesktopExtensionHost } from "../desktopExtensionHost";
import {
  desktopPanelRegistry,
  type DesktopPanelContext
} from "../../panels/panelRegistryModel";
import { useSettingsStore } from "../../settings/settingsStore";

describe("computeNoteStats", () => {
  it("counts words and characters", () => {
    expect(computeNoteStats("one two three", 200)).toMatchObject({ words: 3, characters: 13 });
  });

  it("treats an empty or missing document as zero", () => {
    expect(computeNoteStats("", 200)).toMatchObject({ words: 0, characters: 0, readingMinutes: 0 });
    expect(computeNoteStats(null, 200)).toMatchObject({ words: 0, characters: 0 });
  });

  it("ignores runs of whitespace rather than counting empty words", () => {
    expect(computeNoteStats("  one   two  \n\n three \n", 200).words).toBe(3);
  });

  it("rounds reading time up so a short note is never 0 minutes", () => {
    expect(computeNoteStats("one two three", 200).readingMinutes).toBe(1);
    const longNote = Array.from({ length: 450 }, () => "word").join(" ");
    expect(computeNoteStats(longNote, 200).readingMinutes).toBe(3);
  });

  it("falls back to a sane rate when the setting is misconfigured", () => {
    // A user can type 0 into the number setting; dividing by it would render
    // Infinity in the panel.
    expect(computeNoteStats("one two", 0).readingMinutes).toBe(1);
    expect(Number.isFinite(computeNoteStats("one two", Number.NaN).readingMinutes)).toBe(true);
  });
});

describe("noteStatsManifest", () => {
  it("declares relative contribution ids and matching activation events", () => {
    expect(noteStatsManifest.id).toBe("note-stats");
    expect(noteStatsManifest.contributes.panels.map((panel) => panel.id)).toEqual(["stats"]);
    expect(noteStatsManifest.contributes.commands.map((command) => command.id)).toEqual(["show"]);
    expect(noteStatsManifest.activationEvents).toContain("onView:stats");
    expect(noteStatsManifest.activationEvents).toContain("onCommand:show");
  });
});

describe("the stats panel", () => {
  let host: ReturnType<typeof createDesktopExtensionHost> | null = null;
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    await act(async () => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    await host?.dispose();
    host = null;
    useSettingsStore.setState({
      appValues: {},
      workspaceValues: null,
      workspaceRootPath: null,
      stagedChanges: {}
    });
  });

  /** Activates the extension and renders its panel factory the way the shell does. */
  const mountPanel = async (contents: string | null): Promise<HTMLDivElement> => {
    host = createDesktopExtensionHost();
    host.register({ id: noteStatsManifest.id, trusted: true, activate: activateNoteStats });
    await host.activate(noteStatsManifest.id);
    const panel = desktopPanelRegistry.get("note-stats.stats");
    if (!panel) throw new Error("The stats panel did not register.");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(panel.factory({ documentContents: contents } as DesktopPanelContext));
    });
    return container;
  };

  it("renders the stats of the open note", async () => {
    const dom = await mountPanel("one two three");

    expect(dom.textContent).toContain("Words");
    expect(dom.textContent).toContain("3");
    expect(dom.textContent).toContain("Reading time");
  });

  /**
   * Nothing re-renders a mounted panel when a setting changes on its own, so
   * the panel subscribes through `context.settings.onDidChange` — toggling
   * "Show reading time" in Settings must reach the open panel.
   */
  it("re-reads settings changed while the panel is open", async () => {
    const dom = await mountPanel("one two three");
    expect(dom.textContent).toContain("Reading time");

    await act(async () => {
      useSettingsStore
        .getState()
        .stageChange("extension-note-stats.showReadingTime", false);
    });

    expect(dom.textContent).not.toContain("Reading time");

    await act(async () => {
      useSettingsStore
        .getState()
        .stageChange("extension-note-stats.showReadingTime", true);
      useSettingsStore
        .getState()
        .stageChange("extension-note-stats.wordsPerMinute", 100);
    });

    // 3 words at 100 wpm still rounds up to a minute — the row is back.
    expect(dom.textContent).toContain("Reading time");
  });

  it("shows the empty state when no note is open", async () => {
    const dom = await mountPanel(null);

    expect(dom.textContent).toContain("Open a Markdown note");
  });
});
