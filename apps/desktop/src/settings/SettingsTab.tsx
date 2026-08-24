/**
 * Main settings tab component.
 *
 * Responsive settings layout with a header, navigation drawer, and content
 * area. On mount (inside Tauri), loads settings via the store using the current
 * workspace root path so the "Workspace" nav group appears when one is open.
 *
 * A ref guards against double-loading in React StrictMode (which mounts
 * effects twice in development). The load error, if any, renders as a banner.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { cn } from "../lib/utils";
import { workspaceDesktopApi } from "../workspace/workspaceAdapter";
import { getExtensionBootstrap } from "../extensions/bootstrapRef";
import { getWorkspaceBridge } from "../extensions/workspaceBridge";
import { useSettingsStore } from "./settingsStore";
import { SettingsNav } from "./SettingsNav";
import { SettingsContent } from "./SettingsContent";
import { SettingsHeaderBar } from "./SettingsHeaderBar";

/**
 * The settings tab surface.
 *
 * Fills its container and switches the navigation from a fixed desktop column
 * to a modal drawer with focus restoration on narrow screens.
 */
export function SettingsTab() {
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadError = useSettingsStore((s) => s.loadError);
  const [navOpen, setNavOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);
  // Guard against double-load in React StrictMode (dev double-mounts effects).
  const loadedRef = useRef(false);

  const openNav = useCallback((): void => setNavOpen(true), []);
  const closeNavAndRestoreFocus = useCallback((): void => {
    setNavOpen(false);
    requestAnimationFrame(() => hamburgerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeNavAndRestoreFocus();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [navOpen, closeNavAndRestoreFocus]);

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
          className="border-b border-destructive bg-[color-mix(in_srgb,var(--tn-color-destructive)_10%,transparent)] px-4 py-2 text-sm text-destructive"
          role="alert"
        >
          {loadError}
        </div>
      )}
      <SettingsHeaderBar />
      <div className="relative flex min-h-0 min-w-0 flex-1">
        {navOpen && (
          <button
            type="button"
            className="absolute inset-0 z-20 cursor-pointer border-0 bg-overlay p-0"
            aria-label="Close settings navigation"
            data-testid="settings-navigation-scrim"
            onClick={closeNavAndRestoreFocus}
          />
        )}
        <SettingsNav open={navOpen} onClose={closeNavAndRestoreFocus} />
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-editor">
          <button
            ref={hamburgerRef}
            type="button"
            className={cn(
              "hidden max-[760px]:absolute max-[760px]:start-2 max-[760px]:top-2 max-[760px]:z-20 max-[760px]:size-9 max-[760px]:cursor-pointer max-[760px]:place-items-center max-[760px]:text-muted-foreground max-[760px]:opacity-100 max-[760px]:transition-opacity max-[760px]:duration-150 max-[760px]:grid",
              navOpen && "max-[760px]:pointer-events-none max-[760px]:opacity-0"
            )}
            aria-label="Open settings navigation"
            aria-controls="settings-navigation"
            aria-expanded={navOpen}
            onClick={openNav}
          >
            <Menu aria-hidden="true" />
          </button>
          <SettingsContent />
        </main>
      </div>
    </div>
  );
}
