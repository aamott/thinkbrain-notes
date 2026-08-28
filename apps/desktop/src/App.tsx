import { useEffect } from "react";
import { usePlatformCapabilities } from "./native/platformCapabilities";
import { ShellRoot } from "./shell/ShellRoot";
import { ThemeProvider } from "./settings/ThemeProvider";
import { useSyncLifecycleAdapter } from "./sync/syncLifecycleAdapter";

export default function App() {
  const loadPlatformCapabilities = usePlatformCapabilities((s) => s.load);
  useSyncLifecycleAdapter();

  useEffect(() => {
    void loadPlatformCapabilities();
  }, [loadPlatformCapabilities]);

  return (
    <ThemeProvider>
      <ShellRoot />
    </ThemeProvider>
  );
}
