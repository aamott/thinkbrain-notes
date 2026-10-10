/**
 * UI scaling: the `ui.scale` percentage applied to the root font size.
 *
 * One hook mounted above the shells does the whole feature: an effect writes
 * `documentElement.style.fontSize` from the setting's effective value, and a
 * window listener maps Ctrl/Cmd+= , Ctrl/Cmd+- , Ctrl/Cmd+0 (plus numpad
 * equivalents) to adjustments through `stageChange` — the same write path the
 * settings control uses, so keyboard and Settings stay in lockstep and the
 * debounced autosave persists either way.
 *
 * Root font size rather than CSS `zoom` or the native webview zoom: wry's
 * `zoom()` is a no-op on Android, and CSS `zoom` reparents fixed-position
 * descendants (portaled menus would land offset). Scaling rem leaves px
 * hairlines and the editor's separate `editor.fontSize` untouched, and keeps
 * pointer coordinates consistent with layout.
 */

import { useEffect } from "react";

import { appSettingsRegistry, useSettingsStore } from "../settings/settingsStore";
import { resolveEffectiveValue } from "../settings/settingsHelpers";
import { useEffectiveValue } from "../settings/useEffectiveValue";

export const UI_SCALE_KEY = "ui.scale";

/** Bounds mirrored from the `ui.scale` setting definition. */
const MIN_SCALE = 50;
const MAX_SCALE = 200;
const DEFAULT_SCALE = 100;

/** Keyboard step in percent, matching the setting's granularity. */
const SCALE_STEP = 10;

/** The webview default root font size — index.css never overrides it. */
const BASE_FONT_PX = 16;

/** Clamps any stored value into the supported integer percent range. */
export function clampUiScale(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(n)));
}

/** Reads the scale straight from the store — for callers outside React. */
function currentUiScale(): number {
  const { stagedChanges, appValues, workspaceValues } = useSettingsStore.getState();
  return clampUiScale(
    resolveEffectiveValue(
      UI_SCALE_KEY,
      stagedChanges,
      appValues,
      workspaceValues,
      appSettingsRegistry.getDefinition(UI_SCALE_KEY)
    )
  );
}

/** Nudges the scale by `deltaPercent` and stages it for autosave. */
export function adjustUiScale(deltaPercent: number): void {
  useSettingsStore.getState().stageChange(UI_SCALE_KEY, clampUiScale(currentUiScale() + deltaPercent));
}

/** Restores the definition's default scale — 100% on desktop, 125% on touch. */
export function resetUiScale(): void {
  const fallback = appSettingsRegistry.getDefinition(UI_SCALE_KEY)?.default;
  useSettingsStore.getState().stageChange(UI_SCALE_KEY, clampUiScale(fallback));
}

/**
 * Applies `ui.scale` to the document and binds the zoom shortcuts.
 * Mount once near the app root so both shells share the behaviour.
 */
export function useUiScale(): void {
  const scale = clampUiScale(useEffectiveValue(UI_SCALE_KEY));

  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = `${(BASE_FONT_PX * scale) / 100}px`;
    return () => {
      root.style.fontSize = "";
    };
  }, [scale]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.code === "Equal" || event.code === "NumpadAdd") {
        event.preventDefault();
        adjustUiScale(SCALE_STEP);
      } else if (event.code === "Minus" || event.code === "NumpadSubtract") {
        event.preventDefault();
        adjustUiScale(-SCALE_STEP);
      } else if (event.code === "Digit0" || event.code === "Numpad0") {
        event.preventDefault();
        resetUiScale();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
