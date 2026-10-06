import { describe, expect, it } from "vitest";

import { createTabRegistry, inferTabKind } from "./index";

describe("tab registry", () => {
  it("keeps platform-neutral tab contribution metadata", () => {
    const registry = createTabRegistry();
    const registration = {
      kind: "extension.calendar",
      label: "Calendar",
      isAvailable: true
    };

    registry.register(registration);

    expect(registry.get("extension.calendar")).toEqual(registration);
    expect(registry.entries()).toEqual([registration]);
  });

  /**
   * An extension's activation scope owns everything it registers, so a tab
   * contribution has to be revocable like a command or a panel.
   */
  it("returns a handle that unregisters the contribution", () => {
    const registry = createTabRegistry();
    const registration = { kind: "extension.calendar", label: "Calendar", isAvailable: true };

    const handle = registry.register(registration);
    handle.dispose();

    expect(registry.get("extension.calendar")).toBeUndefined();
    expect(registry.entries()).toEqual([]);
  });

  it("permits re-registration after disposal and ignores a repeated dispose", () => {
    const registry = createTabRegistry();
    const handle = registry.register({ kind: "extension.calendar", label: "Calendar", isAvailable: true });

    handle.dispose();
    handle.dispose();
    const second = registry.register({ kind: "extension.calendar", label: "Calendar v2", isAvailable: true });

    expect(registry.get("extension.calendar")?.label).toBe("Calendar v2");
    second.dispose();
  });

  it("rejects ambiguous duplicate renderers", () => {
    const registry = createTabRegistry();
    registry.register({ kind: "editor", label: "Editor", isAvailable: true });

    expect(() =>
      registry.register({ kind: "editor", label: "Other editor", isAvailable: true })
    ).toThrow("already registered");
  });
});

describe("inferTabKind", () => {
  it("routes Markdown extensions to the editor", () => {
    expect(inferTabKind("note.md")).toBe("editor");
    expect(inferTabKind("note.markdown")).toBe("editor");
    expect(inferTabKind("note.mdx")).toBe("editor");
  });

  it("routes image extensions to image-viewer", () => {
    expect(inferTabKind("photo.png")).toBe("image-viewer");
    expect(inferTabKind("photo.JPG")).toBe("image-viewer");
    expect(inferTabKind("icon.svg")).toBe("image-viewer");
    expect(inferTabKind("photo.webp")).toBe("image-viewer");
  });

  it("routes audio extensions to audio-viewer", () => {
    expect(inferTabKind("song.mp3")).toBe("audio-viewer");
    expect(inferTabKind("song.OGG")).toBe("audio-viewer");
    expect(inferTabKind("song.flac")).toBe("audio-viewer");
  });

  it("routes video extensions to video-viewer", () => {
    expect(inferTabKind("clip.mp4")).toBe("video-viewer");
    expect(inferTabKind("clip.WEBM")).toBe("video-viewer");
    expect(inferTabKind("clip.mov")).toBe("video-viewer");
  });

  it("routes code/text/config extensions to code-editor", () => {
    expect(inferTabKind("main.ts")).toBe("code-editor");
    expect(inferTabKind("config.json")).toBe("code-editor");
    expect(inferTabKind("style.css")).toBe("code-editor");
    expect(inferTabKind("app.py")).toBe("code-editor");
  });

  it("falls back to code-editor for unknown extensions", () => {
    expect(inferTabKind("file.xyz")).toBe("code-editor");
  });

  it("falls back to code-editor for files with no extension", () => {
    expect(inferTabKind("README")).toBe("code-editor");
    expect(inferTabKind("path/to/Makefile")).toBe("code-editor");
  });

  it("handles paths with directories", () => {
    expect(inferTabKind("folder/sub/note.md")).toBe("editor");
    expect(inferTabKind("assets/images/logo.png")).toBe("image-viewer");
  });
});
