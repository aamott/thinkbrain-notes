import { useEffect } from "react";
import { usePlatformCapabilities } from "./native/platformCapabilities";
import { ShellRoot } from "./shell/ShellRoot";
import { ThemeProvider } from "./settings/ThemeProvider";
import { useSyncTriggerAdapter } from "./sync/syncTriggerAdapter";

export default function App() {
  const loadPlatformCapabilities = usePlatformCapabilities((s) => s.load);
  useSyncTriggerAdapter();

  useEffect(() => {
    void loadPlatformCapabilities();
  }, [loadPlatformCapabilities]);

  return (
    <ThemeProvider>
      <ShellRoot />
    </ThemeProvider>
  );
}
