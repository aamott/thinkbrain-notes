/**
 * Main settings tab component.
 *
 * Two-pane layout: left nav (`SettingsNav`) + right content area
 * (`SettingsContent`). Both panes scroll independently. On mount (inside
 * Tauri), loads settings via the store using the current workspace root path
 * so the "Workspace" nav group appears when a workspace is open.
 *
 * A ref guards against double-loading in React StrictMode (which mounts
 * effects twice in development). The load error, if any, renders as a banner.
 */

import { useEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { workspaceDesktopApi } from "../workspace/workspaceAdapter";
import { getExtensionBootstrap } from "../extensions/bootstrapRef";
import { getWorkspaceBridge } from "../extensions/workspaceBridge";
import { useSettingsStore } from "./settingsStore";
import { SettingsNav } from "./SettingsNav";
import { SettingsContent } from "./SettingsContent";
import { SettingsSaveBar } from "./SettingsSaveBar";

/**
 * The settings tab surface.
 *
 * Fills its container (TabContent wraps it). The left nav is a fixed-width
 * column; the content area is `flex-1`. Both use `min-h-0` so flex children
 * can shrink and scroll independently.
 */
export function SettingsTab() {
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadError = useSettingsStore((s) => s.loadError);
  // Guard against double-load in React StrictMode (dev double-mounts effects).
  const loadedRef = useRef(false);

  // An extension registers its settings schema when it activates, and most
  // activate lazily — so before this, a journal you had not opened yet simply
  // had no section here, and there was no way to configure it from a standing
  // start. Runs outside the Tauri guard: it is app state, not native I/O.
  useEffect(() => {
    void getExtensionBootstrap()?.activateAll();
  }, []);

  useEffect(() => {
    // Non-Tauri contexts (tests, web preview) skip the native load.
    if (!isTauri()) return;
    if (loadedRef.current) return;
    loadedRef.current = true;

    // Load app settings plus workspace settings if a workspace window root
    // exists. `windowWorkspaceRoot` resolves to null when no workspace is open.
    void (async () => {
      // Only a *secondary* workspace window registers a root natively, so in
      // the main window this is null even with a vault open — and settings
      // loaded with no workspace, leaving every workspace-scoped setting
      // permanently unsaveable. The shell's own bridge is the live answer; the
      // await above it guarantees the shell's mount effect has published it.
      const windowRoot = await workspaceDesktopApi.windowWorkspaceRoot();
      const root = windowRoot ?? getWorkspaceBridge()?.rootPath ?? null;
      // Skip the reload on remount when the store already holds settings for
      // the same workspace root. The store is a module-level singleton, so
      // `loaded` and `workspaceRootPath` survive tab unmount/remount — but the
      // component-local `loadedRef` does not, so without this guard a remount
      // would call `loadSettings`, which clears `stagedChanges` and loses any
      // unsaved edits the user staged before switching tabs.
      const { loaded, workspaceRootPath } = useSettingsStore.getState();
      if (loaded && workspaceRootPath === root) return;
      await loadSettings(root);
    })();
  }, [loadSettings]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      {loadError && (
        <div
          role="alert"
          className="border-b border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {loadError}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {/* Left nav: fixed-width, independently scrollable. */}
        <div className="w-56 shrink-0 border-r border-border bg-sidebar">
          <SettingsNav />
        </div>
        {/* Right content: fills remaining space, independently scrollable.
            The content area is flex-1 (scrolls); the save bar is sticky at the
            bottom and always visible within the right pane. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <SettingsContent />
          <SettingsSaveBar />
        </div>
      </div>
    </div>
  );
}
