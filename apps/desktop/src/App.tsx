import { DesktopShell } from "./shell/DesktopShell";
import { useShellState } from "./shell/useShellState";
import { ThemeProvider } from "./settings/ThemeProvider";

/**
 * Shell state is owned above the chrome so a second chrome can consume it.
 * `ShellRoot` takes this over once the form-factor gate exists.
 */
function Shell() {
  return <DesktopShell shell={useShellState()} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}
