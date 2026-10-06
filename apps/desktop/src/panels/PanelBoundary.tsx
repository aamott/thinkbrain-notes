import { Component, type ErrorInfo, type ReactNode } from "react";

import { Unavailable } from "../shell/Unavailable";

/**
 * Crash containment for one panel's worth of UI.
 *
 * A throw anywhere in a dock popout — a panel's render, an extension's
 * factory, an action's menu — used to propagate to the root and unmount the
 * whole shell, leaving a blank window. The boundary holds the failure inside
 * the dock instead: the activity bar, editor, and sibling panels keep
 * working, and "Try again" remounts the panel.
 *
 * `fallback` swaps the full empty state for a slimmer surface when the
 * boundary guards a small region (e.g. the chrome row).
 */
export class PanelBoundary extends Component<
  {
    /** Panel label, used in the fallback and the console report. */
    readonly label: string;
    readonly fallback?: ReactNode;
    readonly children: ReactNode;
  },
  { readonly error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error | null } {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Fail loudly: the fallback tells the user something broke, this tells
    // the console (and anyone reporting a bug) what and where.
    console.error(`[panels] "${this.props.label}" crashed.`, error, info.componentStack);
  }

  private readonly retry = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <Unavailable
          title={`${this.props.label} could not be shown`}
          description="This panel hit an error and was stopped before it could take the rest of the app down with it."
        >
          <button
            type="button"
            className="mt-3 rounded-small border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent"
            onClick={this.retry}
          >
            Try again
          </button>
        </Unavailable>
      );
    }
    return this.props.children;
  }
}
