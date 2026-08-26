import { ShellRoot } from "./shell/ShellRoot";
import { ThemeProvider } from "./settings/ThemeProvider";

export default function App() {
  return (
    <ThemeProvider>
      <ShellRoot />
    </ThemeProvider>
  );
}
