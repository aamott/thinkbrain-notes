import { useEffect } from "react";
import { usePlatformCapabilities } from "./native/platformCapabilities";
import { ShellRoot } from "./shell/ShellRoot";
import { ThemeProvider } from "./settings/ThemeProvider";
import { useUiScale } from "./lib/useUiScale";
import { useSyncLifecycleAdapter } from "./sync/syncLifecycleAdapter";

export default function App() {
  const loadPlatformCapabilities = usePlatformCapabilities((s) => s.load);
  useSyncLifecycleAdapter();
  useUiScale();

  useEffect(() => {
    void loadPlatformCapabilities();
  }, [loadPlatformCapabilities]);

  return (
    <ThemeProvider>
      <ShellRoot />
    </ThemeProvider>
  );
}
