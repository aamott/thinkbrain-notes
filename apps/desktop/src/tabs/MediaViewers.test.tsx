// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadMediaObjectUrl } = vi.hoisted(() => ({ loadMediaObjectUrl: vi.fn() }));
vi.mock("../native/assets", () => ({
  createVaultAssetResolver: () => () => null,
  loadMediaObjectUrl
}));

import { NativeCommandError } from "../native/commands";
import { AudioViewer, VideoViewer } from "./MediaViewers";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const revokeObjectURL = vi.fn();
let originalRevoke: typeof URL.revokeObjectURL | undefined;

beforeEach(() => {
  originalRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  loadMediaObjectUrl.mockReset();
  revokeObjectURL.mockReset();
  if (originalRevoke) {
    URL.revokeObjectURL = originalRevoke;
  }
});

async function renderViewer(
  Viewer: typeof AudioViewer,
  rootPath: string | null,
  relativePath: string | null
): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Viewer rootPath={rootPath} relativePath={relativePath} />);
  });
  return container;
}

describe("MediaPlayer", () => {
  it("plays the audio element from the blob URL the loader returns", async () => {
    loadMediaObjectUrl.mockResolvedValue("blob:media/fake");
    const view = await renderViewer(AudioViewer, "/vault", "audio/song.mp3");

    const audio = view.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute("src")).toBe("blob:media/fake");
    expect(loadMediaObjectUrl).toHaveBeenCalledWith("/vault", "audio/song.mp3");
  });

  it("plays the video element from the blob URL the loader returns", async () => {
    loadMediaObjectUrl.mockResolvedValue("blob:media/fake-video");
    const view = await renderViewer(VideoViewer, "/vault", "clips/demo.webm");

    const video = view.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toBe("blob:media/fake-video");
  });

  it("revokes the object URL when the viewer unmounts", async () => {
    loadMediaObjectUrl.mockResolvedValue("blob:media/fake");
    await renderViewer(AudioViewer, "/vault", "song.mp3");

    await act(async () => root?.unmount());
    root = null;

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:media/fake");
  });

  it("revokes the object URL when the file changes", async () => {
    loadMediaObjectUrl.mockResolvedValueOnce("blob:media/first");
    const view = await renderViewer(AudioViewer, "/vault", "one.mp3");

    loadMediaObjectUrl.mockResolvedValueOnce("blob:media/second");
    await act(async () => {
      root?.render(<AudioViewer rootPath="/vault" relativePath="two.mp3" />);
    });

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:media/first");
    expect(view.querySelector("audio")?.getAttribute("src")).toBe("blob:media/second");
  });

  it("shows the load failure and the native error's message", async () => {
    loadMediaObjectUrl.mockRejectedValue(
      new NativeCommandError({
        code: "workspace.media_too_large",
        message: "This file is too large to play here."
      })
    );
    const view = await renderViewer(AudioViewer, "/vault", "huge.mp3");

    expect(view.textContent).toContain("The audio file could not be loaded.");
    expect(view.textContent).toContain("This file is too large to play here.");
  });

  it("shows the load failure without a detail for non-native errors", async () => {
    loadMediaObjectUrl.mockRejectedValue(new Error("Media path escapes the vault: ../x.mp3"));
    const view = await renderViewer(AudioViewer, "/vault", "../x.mp3");

    expect(view.textContent).toContain("The audio file could not be loaded.");
    expect(view.textContent).not.toContain("escapes the vault");
  });

  it("shows the failure state when the media element itself errors", async () => {
    loadMediaObjectUrl.mockResolvedValue("blob:media/corrupt");
    const view = await renderViewer(AudioViewer, "/vault", "corrupt.mp3");

    const audio = view.querySelector("audio");
    await act(async () => {
      audio?.dispatchEvent(new Event("error"));
    });

    expect(view.querySelector("audio")).toBeNull();
    expect(view.textContent).toContain("The audio file could not be loaded.");
  });

  it("shows the no-path state when either path is missing", async () => {
    const view = await renderViewer(AudioViewer, null, "song.mp3");

    expect(view.textContent).toContain("No file path provided.");
    expect(loadMediaObjectUrl).not.toHaveBeenCalled();
  });
});
