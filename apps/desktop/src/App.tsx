import { useEffect } from "react";

import { getDesktopShellStatus, normalizeNativeError } from "./native/commands";
import { useWorkspaceIndexer } from "./search/useWorkspaceIndexer";
import { loadAppSettings } from "./settings/settingsService";
import { DesktopShell } from "./shell/DesktopShell";
import { useAppStore } from "./stores/appStore";

/** Boots native/settings state, then delegates all desktop UI to the shell. */
export function App() {
  const settings = useAppStore((state) => state.settings.settings);
  const loadSettings = useAppStore((state) => state.loadSettings);
  const setNativeShellChecking = useAppStore(
    (state) => state.setNativeShellChecking
  );
  const setNativeShellReady = useAppStore((state) => state.setNativeShellReady);
  const setNativeShellError = useAppStore((state) => state.setNativeShellError);

  useWorkspaceIndexer();

  useEffect(() => {
    let cancelled = false;

    setNativeShellChecking();

    getDesktopShellStatus()
      .then((status) => {
        if (!cancelled) {
          setNativeShellReady(status);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setNativeShellError(normalizeNativeError(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setNativeShellChecking, setNativeShellReady, setNativeShellError]);

  useEffect(() => {
    void loadSettings(loadAppSettings);
  }, [loadSettings]);

  useEffect(() => {
    document.documentElement.dataset.thinkbrainTheme = settings.theme;
  }, [settings.theme]);

  return <DesktopShell />;
}
