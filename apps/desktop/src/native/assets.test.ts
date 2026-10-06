import { afterEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURI(path)}`,
  invoke
}));

const { createVaultAssetResolver, loadMediaObjectUrl } = await import("./assets");

describe("createVaultAssetResolver", () => {
  const resolve = createVaultAssetResolver("/vault", "notes/today.md");

  it("resolves a path relative to the note", () => {
    expect(resolve("img/cat.png")).toBe("asset://localhost//vault/notes/img/cat.png");
  });

  it("resolves a vault-absolute path", () => {
    expect(resolve("/assets/cat.png")).toBe("asset://localhost//vault/assets/cat.png");
  });

  it("resolves a parent-relative path that stays inside the vault", () => {
    expect(resolve("../shared/cat.png")).toBe("asset://localhost//vault/shared/cat.png");
  });

  it("refuses to escape the vault root", () => {
    expect(resolve("../../etc/passwd")).toBeNull();
  });

  it("returns null for an empty source", () => {
    expect(resolve("")).toBeNull();
  });

  it("resolves against the vault root for a note at the top level", () => {
    const topLevel = createVaultAssetResolver("/vault", "today.md");
    expect(topLevel("img/cat.png")).toBe("asset://localhost//vault/img/cat.png");
  });
});

describe("loadMediaObjectUrl", () => {
  afterEach(() => {
    invoke.mockReset();
    vi.restoreAllMocks();
  });

  /** Loads and returns the Blob that was handed to `URL.createObjectURL`. */
  async function loadBlob(rootPath: string, relativePath: string): Promise<Blob> {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:media/mock");
    const url = await loadMediaObjectUrl(rootPath, relativePath);
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    createObjectURL.mockRestore();
    expect(url).toBe("blob:media/mock");
    return blob;
  }

  function mockBytes(text: string): ArrayBuffer {
    return new TextEncoder().encode(text).buffer as ArrayBuffer;
  }

  it("invokes read_media_file and wraps the bytes in a typed Blob", async () => {
    invoke.mockResolvedValueOnce(mockBytes("RIFFdata"));

    const blob = await loadBlob("/vault", "media/song.mp3");

    expect(invoke).toHaveBeenCalledWith("read_media_file", {
      rootPath: "/vault",
      relativePath: "media/song.mp3"
    });
    expect(blob.type).toBe("audio/mpeg");
    expect(await blob.text()).toBe("RIFFdata");
  });

  it("normalizes dot and empty segments before invoking", async () => {
    invoke.mockResolvedValueOnce(mockBytes("x"));

    await loadBlob("/vault", "clips//./nested/../demo.webm");

    expect(invoke).toHaveBeenCalledWith("read_media_file", {
      rootPath: "/vault",
      relativePath: "clips/demo.webm"
    });
  });

  it.each([
    ["a.mp3", "audio/mpeg"],
    ["a.MP3", "audio/mpeg"],
    ["a.m4a", "audio/mp4"],
    ["a.aac", "audio/aac"],
    ["a.wav", "audio/wav"],
    ["a.ogg", "audio/ogg"],
    ["a.oga", "audio/ogg"],
    ["a.opus", "audio/ogg"],
    ["a.flac", "audio/flac"],
    ["a.weba", "audio/webm"],
    ["a.mp4", "video/mp4"],
    ["a.m4v", "video/mp4"],
    ["a.webm", "video/webm"],
    ["a.mov", "video/quicktime"],
    ["a.mkv", "video/x-matroska"],
    ["a.ogv", "video/ogg"],
    ["a.avi", "video/x-msvideo"],
    ["a.unknown", ""]
  ])("picks the mime type for %s", async (path, mime) => {
    invoke.mockResolvedValueOnce(mockBytes("x"));

    const blob = await loadBlob("/vault", path);

    expect(blob.type).toBe(mime);
  });

  it("refuses a path that escapes the vault without invoking", async () => {
    await expect(loadMediaObjectUrl("/vault", "../outside.mp3")).rejects.toThrow(
      /escapes the vault/
    );

    expect(invoke).not.toHaveBeenCalled();
  });
});
