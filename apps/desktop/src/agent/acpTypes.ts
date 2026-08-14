/**
 * ACP Tauri command and event interface.
 *
 * @internal WIP — scaffolding for the pending ACP host work. NOT used by any
 * production component yet (only tests import this). The contract below has
 * DIVERGED from `plans/ai/pending-agent_registry-low-med.md` and must be
 * rewritten to match the plan before wiring in:
 *   - Command name: `agent_detect` → plan specifies `agent_list_available`.
 *   - Field names: `id/label/binary/acpArgs/acpSupport/installed` → plan
 *     specifies `agentId/displayName/available/acpMode/version?`.
 *   - Security boundary: `AgentDescriptor` currently exposes `binary` and
 *     `acpArgs` to the renderer; the plan requires the renderer to receive
 *     only an opaque `agentId` (no shell strings or args).
 *   - Session commands: `agent_spawn`/`agent_prompt`/`agent_cancel`/
 *     `agent_close` → plan (`pending-acp_host_runtime-med-hard.md`) uses
 *     `agent_session_new`/`agent_session_close` as separate commands.
 *
 * TODO(pending-agent_registry): rewrite to match the plan contract from day
 * one rather than carrying this divergent shape forward.
 *
 * This file defines the contract between the renderer and the Rust ACP host.
 * The Rust side (owned by a separate story — see
 * `plans/ai/pending-agent_chat_text_streaming_mvp-high-hard.md`) implements
 * these Tauri commands using the official `agent-client-protocol` Rust crate
 * and emits the events listed here. The renderer never imports
 * `@agentclientprotocol/sdk`; it only calls these commands and listens for
 * these events.
 *
 * Convention follows `native/commands.ts`: commands are typed in a
 * `AcpCommandMap`, invoked via `invokeNativeCommand`, and results use
 * camelCase field names (Rust serde `rename_all = "camelCase"`).
 */

/* ------------------------------------------------------------------ */
/* Agent registry                                                      */
/* ------------------------------------------------------------------ */

/** Whether an agent supports ACP out of the box or needs an extension. */
export type AcpSupport = "native" | "extension-required";

/** A single detected agent and how to invoke it in ACP mode. */
export interface AgentDescriptor {
  /** Stable id, e.g. "mistral", "devin", "codex", "cursor". */
  readonly id: string;
  /** Human-readable name for the UI. */
  readonly label: string;
  /** Binary name found on PATH, e.g. "mistral", "devin". */
  readonly binary: string;
  /** Arguments appended after the binary to enter ACP mode. */
  readonly acpArgs: readonly string[];
  /** Whether ACP works by default or requires an extension/setup step. */
  readonly acpSupport: AcpSupport;
  /** True when the binary was found on PATH at detection time. */
  readonly installed: boolean;
}

/* ------------------------------------------------------------------ */
/* Session lifecycle                                                   */
/* ------------------------------------------------------------------ */

/** Result of `agent_spawn`: a live ACP connection ready for prompts. */
export interface AcpSessionHandle {
  /** Unique connection id used to route subsequent commands and events. */
  readonly connectionId: string;
  /** ACP session id returned by `session/new`. */
  readonly sessionId: string;
}

/* ------------------------------------------------------------------ */
/* Tauri events emitted by the Rust host                              */
/* ------------------------------------------------------------------ */

/**
 * A single `session/update` notification forwarded from the agent.
 *
 * The Rust host forwards update variants as a discriminated union. For the
 * text MVP only `agent-message-chunk` and `stop` are consumed by the
 * renderer; other variants are logged but not rendered.
 */
export type AcpSessionUpdate =
  | { readonly connectionId: string; readonly sessionId: string; readonly kind: "agent-message-chunk"; readonly text: string }
  | { readonly connectionId: string; readonly sessionId: string; readonly kind: "agent-thought-chunk"; readonly text: string }
  | { readonly connectionId: string; readonly sessionId: string; readonly kind: "tool-call"; readonly toolCallId: string; readonly toolName: string; readonly raw: unknown }
  | { readonly connectionId: string; readonly sessionId: string; readonly kind: "tool-call-update"; readonly toolCallId: string; readonly raw: unknown }
  | { readonly connectionId: string; readonly sessionId: string; readonly kind: "plan"; readonly raw: unknown }
  | { readonly connectionId: string; readonly sessionId: string; readonly kind: "usage-update"; readonly raw: unknown }
  | { readonly connectionId: string; readonly sessionId: string; readonly kind: "session-info-update"; readonly raw: unknown }
  | { readonly connectionId: string; readonly sessionId: string; readonly kind: "stop"; readonly stopReason: string };

/** Event names used by the Rust host. */
export const ACP_EVENT_NAMES = {
  /** A `session/update` notification. Payload: {@link AcpSessionUpdate}. */
  sessionUpdate: "agent://session-update",
  /** A fatal error on a connection. Payload: `{ connectionId, sessionId?, message }`. */
  error: "agent://error"
} as const;

/* ------------------------------------------------------------------ */
/* Command map (extends native/commands.ts)                           */
/* ------------------------------------------------------------------ */

/**
 * Commands the Rust host must implement. Added to `NativeCommandMap` via
 * module augmentation so `invokeNativeCommand` types them correctly.
 */
export interface AcpCommandMap {
  /** Probe PATH for known agents and return the registry. */
  readonly agent_detect: {
    readonly args: undefined;
    readonly result: readonly AgentDescriptor[];
  };
  /**
   * Spawn an agent process, run ACP `initialize` + `session/new`, and return
   * a handle. The `cwd` becomes the session's working directory.
   */
  readonly agent_spawn: {
    readonly args: { readonly agentId: string; readonly cwd: string };
    readonly result: AcpSessionHandle;
  };
  /** Send `session/prompt` with a single text content block. */
  readonly agent_prompt: {
    readonly args: { readonly connectionId: string; readonly sessionId: string; readonly text: string };
    readonly result: { readonly stopReason: string };
  };
  /** Send `session/cancel` for an in-flight prompt turn. */
  readonly agent_cancel: {
    readonly args: { readonly connectionId: string; readonly sessionId: string };
    readonly result: null;
  };
  /** Close the connection and terminate the agent process. */
  readonly agent_close: {
    readonly args: { readonly connectionId: string };
    readonly result: null;
  };
}

declare module "@/native/commands" {
  // Module augmentation: merges AcpCommandMap entries into NativeCommandMap
  // so `invokeNativeCommand("agent_spawn", ...)` is fully typed. The empty
  // interface body is the canonical augmentation pattern — the extends clause
  // does the merging, no new members are needed.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface NativeCommandMap extends AcpCommandMap {}
}
