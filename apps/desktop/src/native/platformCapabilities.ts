/**
 * Platform capability declarations for soft compatibility gating.
 *
 * The Rust `platform_capabilities` command reports what the current platform
 * can actually serve (process spawning, keychain, folder picker, etc.). The
 * renderer uses these to hide or disable UI that would call a command the
 * platform cannot back — so the user never sees a silent failure.
 *
 * This is **not** a security sandbox. The Rust side remains the authority for
 * every command; if a renderer bypasses the gate and invokes anyway, the
 * command returns its normal error, not a permission denial.
 */

import { create } from "zustand";
import { invokeNativeCommand, type NativePlatformCapabilities } from "./commands";

/** Defaults assume a full desktop platform so dev-without-Tauri works. */
const DESKTOP_DEFAULTS: NativePlatformCapabilities = {
  canOpenFolder: true,
  canCreateManagedWorkspace: false,
  opensWorkspaceInNewWindow: true,
  canSpawnProcess: true,
  hasKeychain: true
};

interface PlatformCapabilitiesState {
  readonly capabilities: NativePlatformCapabilities;
  readonly loaded: boolean;
  load(): Promise<void>;
}

export const usePlatformCapabilities = create<PlatformCapabilitiesState>((set) => ({
  capabilities: DESKTOP_DEFAULTS,
  loaded: false,
  async load() {
    try {
      const capabilities = await invokeNativeCommand("platform_capabilities");
      set({ capabilities, loaded: true });
    } catch {
      // Non-Tauri (dev server, tests) — keep desktop defaults.
      set({ loaded: true });
    }
  }
}));
