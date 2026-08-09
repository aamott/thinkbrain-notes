/**
 * Agent registry for the desktop app's ACP integration.
 *
 * The renderer cannot probe `PATH` directly — that is a Rust operation. This
 * module is the renderer-side facade over the `agent_detect` Tauri command
 * (typed in {@link acpTypes.ts} via `AcpCommandMap`). It also owns the static
 * list of agents the host knows about (`KNOWN_AGENTS`), which is used as a
 * fallback when the Rust command is not yet implemented or when running
 * outside of Tauri (dev browser, unit tests).
 *
 * The hook {@link useAgentRegistry} is the typical entry point for UI: it runs
 * detection once on mount and exposes `{ agents, defaultAgent, loading }`.
 */

import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

import { invokeNativeCommand } from "@/native/commands";

import type { AgentDescriptor } from "@/agent/acpTypes";

/* ------------------------------------------------------------------ */
/* Static registry                                                     */
/* ------------------------------------------------------------------ */

/**
 * Static list of agents the host knows about, with their detection metadata.
 *
 * `installed` is intentionally omitted — it is filled in at runtime either by
 * the Rust `agent_detect` command (which probes `PATH`) or, as a fallback, by
 * assuming `installed: false`. Order matters: the first `native`-support
 * agent that is installed becomes the default selection (see
 * {@link pickDefaultAgent}), so preferred agents like Mistral come first.
 */
const KNOWN_AGENTS: readonly Omit<AgentDescriptor, "installed">[] = [
  { id: "mistral", label: "Mistral Vibe", binary: "mistral", acpArgs: ["vibe", "--acp"], acpSupport: "native" },
  { id: "devin", label: "Devin CLI", binary: "devin", acpArgs: ["--acp"], acpSupport: "native" },
  { id: "codex", label: "Codex", binary: "codex", acpArgs: ["--acp"], acpSupport: "extension-required" },
  { id: "cursor", label: "Cursor", binary: "cursor", acpArgs: ["--acp"], acpSupport: "extension-required" },
];

/** Returns `KNOWN_AGENTS` with every entry marked `installed: false`. */
function knownAgentsUninstalled(): readonly AgentDescriptor[] {
  return KNOWN_AGENTS.map((agent) => ({ ...agent, installed: false }));
}

/* ------------------------------------------------------------------ */
/* Detection                                                           */
/* ------------------------------------------------------------------ */

/**
 * Detect installed ACP-capable agents on the host.
 *
 * In a Tauri context this calls the `agent_detect` command, which probes
 * `PATH` for each known binary and returns descriptors with `installed`
 * populated. In a non-Tauri context (dev browser, tests) the renderer cannot
 * probe `PATH`, so we return the static registry with `installed: false` —
 * this lets the UI still render the "no agent found" state instead of
 * throwing.
 *
 * If the Tauri command throws (e.g. it has not been implemented yet on the
 * Rust side), we fall back to the same `installed: false` registry and log a
 * warning. This function never throws.
 *
 * @returns A readonly list of agent descriptors, with `installed` set.
 */
export async function detectAgents(): Promise<readonly AgentDescriptor[]> {
  if (!isTauri()) {
    // Non-Tauri contexts (browser dev server, jsdom tests) cannot probe PATH.
    // Surface the known agents as uninstalled so the UI can show the empty
    // state rather than erroring.
    return knownAgentsUninstalled();
  }

  try {
    const detected = await invokeNativeCommand("agent_detect");
    // The Rust side may legitimately return an empty list (no agents on PATH,
    // or the command is stubbed). In that case fall back to the known list
    // marked uninstalled so the UI can still enumerate what *would* be
    // detected.
    return detected.length > 0 ? detected : knownAgentsUninstalled();
  } catch (error) {
    // The Rust command is not yet implemented, or probing failed. Degrade
    // gracefully to the static registry rather than crashing the panel.
    console.warn(
      "[agentRegistry] agent_detect failed; falling back to known agents (installed:false).",
      error,
    );
    return knownAgentsUninstalled();
  }
}

/* ------------------------------------------------------------------ */
/* Default selection                                                   */
/* ------------------------------------------------------------------ */

/**
 * Choose the agent the panel should auto-select.
 *
 * Returns the first installed agent that supports ACP natively (no extra
 * extension/setup step required), or `null` if none qualify. Because
 * {@link KNOWN_AGENTS} is ordered with Mistral first, Mistral is preferred
 * over Devin when both are installed.
 *
 * @param agents The detected agent list (e.g. from {@link detectAgents}).
 * @returns The default agent descriptor, or `null` if no native+installed
 *   agent is available.
 */
export function pickDefaultAgent(
  agents: readonly AgentDescriptor[],
): AgentDescriptor | null {
  for (const agent of agents) {
    if (agent.installed && agent.acpSupport === "native") {
      return agent;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* React hook                                                          */
/* ------------------------------------------------------------------ */

/** Return type of {@link useAgentRegistry}. */
export interface UseAgentRegistryResult {
  /** Detected agents, with `installed` populated. Empty until detection runs. */
  readonly agents: readonly AgentDescriptor[];
  /** Auto-selected default agent, or `null` if none qualify. */
  readonly defaultAgent: AgentDescriptor | null;
  /** True while the initial detection pass is in flight. */
  readonly loading: boolean;
}

/**
 * React hook that runs agent detection once on mount and exposes the result.
 *
 * Uses an `active` flag in the effect cleanup so that if the component
 * unmounts before detection resolves, stale results are not written to state
 * (the same pattern used in `DesktopShell.tsx`). `loading` starts `true` and
 * flips to `false` once detection completes — whether or not any agents were
 * found.
 *
 * @returns `{ agents, defaultAgent, loading }`.
 */
export function useAgentRegistry(): UseAgentRegistryResult {
  const [agents, setAgents] = useState<readonly AgentDescriptor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    void detectAgents()
      .then((detected) => {
        if (!active) return;
        setAgents(detected);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { agents, defaultAgent: pickDefaultAgent(agents), loading };
}
