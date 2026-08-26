import { useCallback, useMemo } from "react";

import { useSettingsStore } from "../../settings/settingsStore";
import { parseHubItems, serializeHubItems, type HubItem } from "./hubModel";

/** Full settings key: module id `ui` plus relative key `mobileHub`. */
export const MOBILE_HUB_KEY = "ui.mobileHub";

/** What `useHubItems` hands back: the current hub and a way to replace it. */
export interface HubItemsHandle {
  readonly items: readonly HubItem[];
  readonly setItems: (items: readonly HubItem[]) => Promise<void>;
}

/**
 * The user's bottom-hub shortcuts, read through the settings store.
 *
 * Writes go through `setSettingImmediately` rather than the staged path: pinning
 * a shortcut is a direct manipulation, and there is no Save button in reach on a
 * phone. That call stages the value before it writes and resolves even when the
 * write fails (it logs and sets `saveError`), so a failed write leaves the hub
 * showing the edit and the store dirty for the next save — the same retry model
 * every other setting has. This hook adds no swallowing of its own: if the store
 * ever starts rejecting, the rejection reaches the caller.
 */
export function useHubItems(): HubItemsHandle {
  const raw = useSettingsStore((state) => state.getEffectiveValue(MOBILE_HUB_KEY));
  // A missing, corrupt or wrong-typed preference must not cost the user their
  // only means of navigating the app; `parseHubItems` answers with the defaults.
  const items = useMemo(() => parseHubItems(typeof raw === "string" ? raw : ""), [raw]);
  const setItems = useCallback(async (next: readonly HubItem[]) => {
    await useSettingsStore
      .getState()
      .setSettingImmediately(MOBILE_HUB_KEY, serializeHubItems(next));
  }, []);
  return { items, setItems };
}
