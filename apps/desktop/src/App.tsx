import { DesktopShell } from "./shell/DesktopShell";
import { ThemeProvider } from "./settings/ThemeProvider";

export default function App() {
  return (
    <ThemeProvider>
      <DesktopShell />
    </ThemeProvider>
  );
}
