/**
 * Tests for the ACP agent registry.
 *
 * Covers the pure registry logic exported from `agentRegistry.ts`:
 *   - `pickDefaultAgent`: native-vs-extension selection rules and the empty
 *     fallback.
 *   - `detectAgents`: the non-Tauri fallback path. The vitest environment is
 *     `node`, so `isTauri()` returns `false` and `detectAgents` resolves to
 *     `KNOWN_AGENTS` with every entry marked `installed: false`.
 *
 * The `useAgentRegistry` React hook is intentionally not exercised here — the
 * node test environment has no DOM, and `@testing-library/react` is not a
 * dependency. The hook is a thin wrapper over the two functions below, so
 * covering them directly is sufficient for unit scope.
 */

import { describe, expect, it } from "vitest";

import { detectAgents, pickDefaultAgent } from "@/agent/agentRegistry";
import type { AgentDescriptor } from "@/agent/acpTypes";

/** Builds an `AgentDescriptor` with sensible defaults for test fixtures. */
function makeAgent(overrides: Partial<AgentDescriptor> = {}): AgentDescriptor {
  return {
    id: "agent",
    label: "Agent",
    binary: "agent",
    acpArgs: ["--acp"],
    acpSupport: "native",
    installed: true,
    ...overrides,
  };
}

describe("pickDefaultAgent", () => {
  it("returns the first installed agent with native ACP support", () => {
    const agents: readonly AgentDescriptor[] = [
      makeAgent({ id: "mistral", installed: false }),
      makeAgent({ id: "devin", installed: true, acpSupport: "native" }),
      makeAgent({ id: "codex", installed: true, acpSupport: "extension-required" }),
    ];

    expect(pickDefaultAgent(agents)).toMatchObject({ id: "devin" });
  });

  it("prefers earlier native agents over later ones (order matters)", () => {
    const agents: readonly AgentDescriptor[] = [
      makeAgent({ id: "mistral", installed: true, acpSupport: "native" }),
      makeAgent({ id: "devin", installed: true, acpSupport: "native" }),
    ];

    expect(pickDefaultAgent(agents)).toMatchObject({ id: "mistral" });
  });

  it("returns null when no agents are installed", () => {
    const agents: readonly AgentDescriptor[] = [
      makeAgent({ id: "mistral", installed: false }),
      makeAgent({ id: "devin", installed: false }),
    ];

    expect(pickDefaultAgent(agents)).toBeNull();
  });

  it("returns null when every installed agent requires an extension", () => {
    const agents: readonly AgentDescriptor[] = [
      makeAgent({ id: "codex", installed: true, acpSupport: "extension-required" }),
      makeAgent({ id: "cursor", installed: true, acpSupport: "extension-required" }),
      makeAgent({ id: "mistral", installed: false, acpSupport: "native" }),
    ];

    expect(pickDefaultAgent(agents)).toBeNull();
  });

  it("skips installed agents whose support is extension-required", () => {
    const agents: readonly AgentDescriptor[] = [
      makeAgent({ id: "codex", installed: true, acpSupport: "extension-required" }),
      makeAgent({ id: "devin", installed: true, acpSupport: "native" }),
    ];

    expect(pickDefaultAgent(agents)).toMatchObject({ id: "devin" });
  });

  it("returns null for an empty registry", () => {
    expect(pickDefaultAgent([])).toBeNull();
  });
});

describe("detectAgents (non-Tauri fallback)", () => {
  it("returns the known agents with every entry marked uninstalled", async () => {
    const agents = await detectAgents();

    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      expect(agent.installed).toBe(false);
    }
  });

  it("lists mistral as the first known agent", async () => {
    const agents = await detectAgents();

    expect(agents[0]).toMatchObject({ id: "mistral" });
  });

  it("never throws — degrades to the static registry on any failure", async () => {
    await expect(detectAgents()).resolves.toBeDefined();
  });
});
