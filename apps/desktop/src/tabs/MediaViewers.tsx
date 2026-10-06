import { useEffect, useState } from "react";

import { getErrorMessage } from "@thinkbrain/core";

import { createVaultAssetResolver, loadMediaObjectUrl } from "../native/assets";
import { NativeCommandError } from "../native/commands";
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

/**
 * Where the player stands for the current file.
 *
 * `failed.detail` carries the native error's message (e.g. the too-large
 * refusal) when one came back over IPC; element-level playback errors carry
 * none, since the media element does not expose one worth showing.
 */
type MediaStatus =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly url: string }
  | { readonly kind: "failed"; readonly detail: string | null };

/**
 * Read-only player for `<audio>`/`<video>` files.
 *
 * Plays from a `blob:` object URL rather than `asset://`: WebKitGTK's
 * GStreamer backend cannot load media from the custom scheme and Android's
 * webview mishandles range requests on it, so the bytes come over IPC
 * (see `native/assets.ts`). The object URL is revoked on cleanup and whenever
 * the file changes.
 */
function MediaPlayer({ element: Element, label, rootPath, relativePath }: MediaPlayerProps) {
  const [status, setStatus] = useState<MediaStatus>({ kind: "loading" });

  useEffect(() => {
    if (!rootPath || !relativePath) return;
    let cancelled = false;
    let createdUrl: string | null = null;

    // No synchronous setStatus here: a file change remounts this component
    // (the viewers key it by path), so the effect starts in `loading` state
    // already. Only the asynchronous resolution updates state.
    loadMediaObjectUrl(rootPath, relativePath).then(
      (url) => {
        // A file change or unmount that beat the load still revokes the URL
        // it produced, so a late resolution cannot leak it.
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setStatus({ kind: "ready", url });
      },
      (error: unknown) => {
        if (cancelled) return;
        setStatus({
          kind: "failed",
          detail: error instanceof NativeCommandError ? getErrorMessage(error) : null
        });
      }
    );

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [rootPath, relativePath]);

  if (!rootPath || !relativePath) {
    return <Unavailable title={label} description="No file path provided." />;
  }

  if (status.kind === "failed") {
    return (
      <Unavailable
        title={label}
        description={`The ${label.toLowerCase()} file could not be loaded.`}
      >
        {status.detail && <p className="mt-2 text-xs">{status.detail}</p>}
      </Unavailable>
    );
  }

  if (status.kind === "loading") {
    return <Unavailable title={label} description="Loading…" />;
  }

  const isAudio = Element === "audio";
  return (
    <div
      className={`flex min-h-0 flex-1 items-center justify-center bg-editor ${isAudio ? "flex-col gap-4" : ""}`}
    >
      {isAudio && <span className="text-sm text-muted-foreground">{relativePath}</span>}
      <Element
        src={status.url}
        controls
        className={isAudio ? "w-full max-w-md" : "max-h-full max-w-full"}
        onError={() => setStatus({ kind: "failed", detail: null })}
      />
    </div>
  );
}

/** Read-only audio player using the native `<audio>` element. */
export function AudioViewer(props: MediaViewerProps) {
  // Keyed by path: a file change remounts the player, which resets it to
  // `loading` and runs the old object's URL cleanup.
  return <MediaPlayer key={`${props.rootPath}:${props.relativePath}`} {...props} element="audio" label="Audio" />;
}

/** Read-only video player using the native `<video>` element. */
export function VideoViewer(props: MediaViewerProps) {
  return <MediaPlayer key={`${props.rootPath}:${props.relativePath}`} {...props} element="video" label="Video" />;
}
