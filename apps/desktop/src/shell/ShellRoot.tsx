import { useCoarsePointer } from "../journal/useCoarsePointer";
import { useSettingsStore } from "../settings/settingsStore";
import { DesktopShell } from "./DesktopShell";
import { PhoneShell } from "./phone/PhoneShell";
import { useNarrowViewport } from "./useNarrowViewport";
import { useShellState } from "./useShellState";

/**
 * Whether to render phone chrome.
 *
 * Both hooks are called unconditionally — `useCoarsePointer() && useNarrowViewport()`
 * would short-circuit and skip a hook call.
 */
// eslint-disable-next-line react-refresh/only-export-components -- gate hook belongs beside the chrome that consumes it
export function usePhoneChrome(): boolean {
  const coarse = useCoarsePointer();
  const narrow = useNarrowViewport();
  return coarse && narrow;
}

/**
 * Chooses a chrome for the shared shell state.
 *
 * The gate is form factor, not build target: nothing here branches on Android,
 * so the phone chrome is reachable in a browser and in Playwright. The
 * `appearance.shellMode` setting overrides the automatic detection so the
 * other layout can be previewed without changing device or window size.
 */
export function ShellRoot() {
  const shell = useShellState();
  const auto = usePhoneChrome();
  const mode = useSettingsStore((s) => s.appValues["appearance.shellMode"] ?? "auto");
  const phone = mode === "phone" || (mode === "auto" && auto);
  return phone ? <PhoneShell shell={shell} /> : <DesktopShell shell={shell} />;
}
