import { Component, type ErrorInfo, type ReactNode } from "react";

import { Unavailable } from "./Unavailable";

/**
 * Keeps a tab that crashed from taking the shell down with it.
 *
 * Mount one per open tab (keyed by the tab id) so the failed tab alone shows
 * this state — switching tabs mounts a fresh boundary, and reopening the same
 * tab gets one honest retry rather than a permanent white screen.
 */
export class TabBoundary extends Component<
  { readonly children: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[TabBoundary] A tab crashed:", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <Unavailable
          title="This tab stopped working"
          description="Something went wrong drawing it. Try again, or close the tab and open it — the note itself is untouched."
        >
          <button
            type="button"
            className="mt-3 cursor-pointer rounded-small border border-border bg-surface px-3 py-1 text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => this.setState({ failed: false })}
          >
            Try again
          </button>
        </Unavailable>
      );
    }
    return this.props.children;
  }
}
