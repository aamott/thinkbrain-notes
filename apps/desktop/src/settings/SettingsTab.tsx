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

  useEffect(() => {
    // Non-Tauri contexts (tests, web preview) skip the native load.
    if (!isTauri()) return;
    if (loadedRef.current) return;
    loadedRef.current = true;

    // Load app settings plus workspace settings if a workspace window root
    // exists. `windowWorkspaceRoot` resolves to null when no workspace is open.
    void (async () => {
      const root = await workspaceDesktopApi.windowWorkspaceRoot();
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
