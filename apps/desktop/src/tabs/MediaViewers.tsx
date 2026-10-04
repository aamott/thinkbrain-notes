import { useState } from "react";

import { createVaultAssetResolver } from "../native/assets";
import { Unavailable } from "../shell/Unavailable";

export interface MediaViewerProps {
  readonly rootPath: string | null;
  readonly relativePath: string | null;
}

/** Builds the `asset://` URL for a vault-relative file, refusing escapes. */
function mediaUrl(rootPath: string | null, relativePath: string | null): string | null {
  if (!rootPath || !relativePath) return null;
  return createVaultAssetResolver(rootPath, "")(relativePath);
}

/** Read-only image viewer with scroll-wheel zoom and fit-to-container. */
export function ImageViewer({ rootPath, relativePath }: MediaViewerProps) {
  const url = mediaUrl(rootPath, relativePath);
  const [zoom, setZoom] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (!url) {
    return <Unavailable title="Image" description="No file path provided." />;
  }

  return (
    <div
      className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-editor"
      onWheel={(e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        setZoom((z) => Math.max(0.1, Math.min(10, z * (e.deltaY < 0 ? 1.1 : 0.9))));
      }}
    >
      {error ? (
        <Unavailable title="Image" description="The image could not be loaded." />
      ) : (
        <img
          src={url}
          alt={relativePath ?? "image"}
          className="max-h-full max-w-full select-none object-contain"
          style={{ transform: zoom !== 1 ? `scale(${zoom})` : undefined }}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          draggable={false}
        />
      )}
      {loaded && zoom !== 1 && (
        <span className="pointer-events-none absolute bottom-2 right-3 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
          {Math.round(zoom * 100)}%
        </span>
      )}
    </div>
  );
}

interface MediaPlayerProps extends MediaViewerProps {
  readonly element: "audio" | "video";
  /** Display name used in unavailable/empty states ("Audio", "Video"). */
  readonly label: string;
}

/** Read-only player for `<audio>`/`<video>` files. */
function MediaPlayer({ element: Element, label, rootPath, relativePath }: MediaPlayerProps) {
  const url = mediaUrl(rootPath, relativePath);
  const [error, setError] = useState(false);

  if (!url) {
    return <Unavailable title={label} description="No file path provided." />;
  }

  if (error) {
    return (
      <Unavailable
        title={label}
        description={`The ${label.toLowerCase()} file could not be loaded.`}
      />
    );
  }

  const isAudio = Element === "audio";
  return (
    <div
      className={`flex min-h-0 flex-1 items-center justify-center bg-editor ${isAudio ? "flex-col gap-4" : ""}`}
    >
      {isAudio && <span className="text-sm text-muted-foreground">{relativePath}</span>}
      <Element
        src={url}
        controls
        className={isAudio ? "w-full max-w-md" : "max-h-full max-w-full"}
        onError={() => setError(true)}
      />
    </div>
  );
}

/** Read-only audio player using the native `<audio>` element. */
export function AudioViewer(props: MediaViewerProps) {
  return <MediaPlayer {...props} element="audio" label="Audio" />;
}

/** Read-only video player using the native `<video>` element. */
export function VideoViewer(props: MediaViewerProps) {
  return <MediaPlayer {...props} element="video" label="Video" />;
}
