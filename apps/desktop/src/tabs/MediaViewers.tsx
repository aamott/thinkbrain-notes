import { convertFileSrc } from "@tauri-apps/api/core";
import { useRef, useState } from "react";

import { Unavailable } from "../shell/Unavailable";

export interface MediaViewerProps {
  readonly rootPath: string | null;
  readonly relativePath: string | null;
}

/** Builds the `asset://` URL for a workspace file via Tauri's asset protocol. */
function mediaUrl(rootPath: string | null, relativePath: string | null): string | null {
  if (!rootPath || !relativePath) return null;
  return convertFileSrc(`${rootPath}/${relativePath}`);
}

/** Read-only image viewer with scroll-wheel zoom and fit-to-container. */
export function ImageViewer({ rootPath, relativePath }: MediaViewerProps) {
  const url = mediaUrl(rootPath, relativePath);
  const imgRef = useRef<HTMLImageElement>(null);
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
          ref={imgRef}
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

/** Read-only audio player using the native `<audio>` element. */
export function AudioViewer({ rootPath, relativePath }: MediaViewerProps) {
  const url = mediaUrl(rootPath, relativePath);
  const [error, setError] = useState(false);

  if (!url) {
    return <Unavailable title="Audio" description="No file path provided." />;
  }

  if (error) {
    return <Unavailable title="Audio" description="The audio file could not be loaded." />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-editor">
      <span className="text-sm text-muted-foreground">{relativePath}</span>
      <audio
        src={url}
        controls
        className="w-full max-w-md"
        onError={() => setError(true)}
      />
    </div>
  );
}

/** Read-only video player using the native `<video>` element. */
export function VideoViewer({ rootPath, relativePath }: MediaViewerProps) {
  const url = mediaUrl(rootPath, relativePath);
  const [error, setError] = useState(false);

  if (!url) {
    return <Unavailable title="Video" description="No file path provided." />;
  }

  if (error) {
    return <Unavailable title="Video" description="The video file could not be loaded." />;
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-editor">
      <video
        src={url}
        controls
        className="max-h-full max-w-full"
        onError={() => setError(true)}
      />
    </div>
  );
}
