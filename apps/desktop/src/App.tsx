import { appIdentity } from "@thinkbrain/core";
import { Button } from "@thinkbrain/ui";
import "@thinkbrain/ui/styles.css";
import { useEffect } from "react";

import { getDesktopShellStatus, normalizeNativeError } from "./native/commands";
import { useAppStore } from "./stores/appStore";
import { WorkspaceExplorer } from "./workspace/WorkspaceExplorer";

export function App() {
  const bootChecks = useAppStore((state) => state.bootChecks);
  const nativeShell = useAppStore((state) => state.nativeShell);
  const recordBootCheck = useAppStore((state) => state.recordBootCheck);
  const setNativeShellChecking = useAppStore(
    (state) => state.setNativeShellChecking
  );
  const setNativeShellReady = useAppStore((state) => state.setNativeShellReady);
  const setNativeShellError = useAppStore((state) => state.setNativeShellError);

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

  return (
    <main className="app-shell" aria-labelledby="app-title">
      <header className="title-bar">
        <div>
          <p className="app-eyebrow">Local Markdown workspace</p>
          <h1 id="app-title">{appIdentity.displayName}</h1>
        </div>
        <Button variant="secondary" onClick={recordBootCheck}>
          Verify state wiring
        </Button>
      </header>

      <nav className="activity-bar" aria-label="Primary navigation">
        <button aria-current="page" type="button">
          Explorer
        </button>
        <button disabled type="button">
          Search
        </button>
        <button disabled type="button">
          Source
        </button>
      </nav>

      <WorkspaceExplorer />

      <section className="editor-area" aria-labelledby="editor-placeholder-title">
        <div className="editor-placeholder">
          <p className="app-eyebrow">Editor area</p>
          <h2 id="editor-placeholder-title">No note selected</h2>
          <p>
            File reading and writing services are available for future editor
            work. Full editor behavior is intentionally left for the editor work
            item.
          </p>
        </div>
      </section>

      <aside className="right-panel" aria-label="Deferred right panel">
        <p>Right panel deferred</p>
      </aside>

      <footer className="status-bar">
        <NativeShellStatus state={nativeShell} />
        <span>Boot checks: {bootChecks}</span>
      </footer>
    </main>
  );
}

function NativeShellStatus({
  state
}: {
  readonly state: ReturnType<typeof useAppStore.getState>["nativeShell"];
}) {
  if (state.status === "checking") {
    return <span>Checking desktop shell...</span>;
  }

  if (state.status === "ready") {
    return (
      <span className="native-status--ready">
        Native shell ready: {state.shell.appName} v{state.shell.shellVersion}
      </span>
    );
  }

  if (state.status === "error") {
    return (
      <span className="native-status--error" role="status">
        Native shell unavailable ({state.error.code}): {state.error.message}
      </span>
    );
  }

  return <span>Desktop shell status pending.</span>;
}
