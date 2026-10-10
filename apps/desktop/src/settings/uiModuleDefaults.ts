/**
 * Form-factor defaults applied to the `ui` settings module at registration.
 *
 * Touch-first form factors default the interface to 125%: small screens and
 * coarse pointers need the roomier chrome, while pointer-fine desktops keep
 * 100%. This rewrites the definition's `default` before registration so every
 * consumer — the settings row, `useEffectiveValue`, `useUiScale` — resolves
 * the same effective value when nothing is stored.
 *
 * Detection is the same `(pointer: coarse)` half of `usePhoneChrome`'s gate,
 * minus the viewport-narrow clause: the scale default should describe the
 * device, not the window it happens to be sized at first paint.
 */

import type { SettingsModule } from "@thinkbrain/core";
import { uiModule } from "@thinkbrain/core";

export const MOBILE_UI_SCALE = 125;

/** The interface sizes the `ui.scale` dropdown offers, ascending. */
export const UI_SCALE_PRESETS: readonly number[] = [75, 90, 100, 110, 125, 150, 175, 200];

/** Whether the primary pointer is coarse (touch). Exported seam for tests. */
export function coarsePointer(): boolean {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
}

/** The `ui` module with `ui.scale`'s default raised to 125% on coarse pointers. */
export function uiModuleForFormFactor(coarse: boolean = coarsePointer()): SettingsModule {
  if (!coarse) return uiModule;
  return {
    ...uiModule,
    sections: uiModule.sections.map((section) => ({
      ...section,
      settings: section.settings?.map((setting) =>
        setting.key === "scale" && setting.type === "number"
          ? { ...setting, default: MOBILE_UI_SCALE }
          : setting
      )
    }))
  };
}
