import type { IndexingState, NativeShellState } from "../stores/appStore";

export function nativeShellText(state: NativeShellState): string {
  if (state.status === "checking") {
    return "Checking desktop shell…";
  }

  if (state.status === "ready") {
    return `Native shell ready: ${state.shell.appName} v${state.shell.shellVersion}`;
  }

  if (state.status === "error") {
    return `Native shell unavailable (${state.error.code}): ${state.error.message}`;
  }

  return "Desktop shell status pending.";
}

export function indexingText(indexing: IndexingState): string {
  if (indexing.status === "indexing") {
    return `Indexing notes: ${indexing.indexed}/${indexing.total}`;
  }

  if (indexing.status === "ready") {
    return `Indexed ${indexing.indexed} ${indexing.indexed === 1 ? "note" : "notes"}`;
  }

  if (indexing.status === "error") {
    const error = indexing.error;
    return `Indexing failed: ${error?.code ?? "unknown error"}: ${error?.message ?? "unknown error"}`;
  }

  return "Indexer idle";
}
