/**
 * Typed seam over the Tauri event channel.
 *
 * Feature code subscribes through `subscribeToNativeEvent` and never touches
 * `@tauri-apps/api/event` or the envelope shape; the name→payload mapping is
 * declared once in `NativeEventMap` so an event name cannot be paired with the
 * wrong payload type. Registration keeps Tauri's contract: the returned
 * promise resolves to the unlisten function and rejects when the native side
 * refuses the subscription — no guard, no swallow.
 */

import { listen } from "@tauri-apps/api/event";

import type { NativeImportProgress } from "./commands";

/**
 * One reportable change, mirroring the native `WorkspaceChange`. The native
 * classifier always pairs a rename with its origin — an unresolvable end
 * becomes a rescan instead — so `oldPath` is a required field here.
 */
export type NativeWorkspaceChange =
  | {
      readonly kind: "created" | "modified" | "deleted" | "rescan";
      /** Workspace-relative, forward slashes. Empty for a rescan. */
      readonly path: string;
    }
  | {
      readonly kind: "renamed";
      readonly path: string;
      /** Where a renamed note came from. */
      readonly oldPath: string;
    };

/** Payload of `workspace://changed`: a settled batch tagged with its root. */
export interface NativeWorkspaceChangedPayload {
  readonly rootPath: string;
  readonly changes: readonly NativeWorkspaceChange[];
}

/** Payload of the sync events that only name their workspace. */
interface NativeWorkspaceNamedPayload {
  readonly rootPath: string;
}

/**
 * Every native event this app subscribes to, mapped to its payload.
 *
 * Keys are the exact channel names the Rust side emits on; field names are
 * camelCase because serde serializes them that way.
 */
export interface NativeEventMap {
  "workspace://changed": NativeWorkspaceChangedPayload;
  "sync://import": NativeImportProgress;
  "sync://status": NativeWorkspaceNamedPayload;
  "sync://setup": NativeWorkspaceNamedPayload;
  "sync://conflicts": NativeWorkspaceNamedPayload;
}

/** The sync events whose payload is only a workspace name. */
export type NativeSyncEventName = "sync://status" | "sync://setup" | "sync://conflicts";

/**
 * Subscribes `onEvent` to a native event, unwrapping the Tauri envelope.
 *
 * Returns the promise Tauri's `listen` returns: it resolves once the native
 * side has registered the listener — yielding the unlisten function — and
 * rejects when registration fails.
 */
export function subscribeToNativeEvent<K extends keyof NativeEventMap>(
  event: K,
  onEvent: (payload: NativeEventMap[K]) => void
): Promise<() => void> {
  return listen<NativeEventMap[K]>(event, (envelope) => onEvent(envelope.payload));
}
