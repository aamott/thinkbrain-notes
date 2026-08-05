import { lazy, Suspense } from "react";
import { PanelTitle } from "./PanelTitle";
import { Unavailable } from "../shell/Unavailable";
import { rightActions, type RightPanel } from "../shell/shellTypes";

/**
 * Lazy-loaded AI assistant panel.
 *
 * Code-split so the agent UI bundle is only fetched when the assistant panel
 * is opened for the first time.
 */
const AssistantPanel = lazy(async () => {
  const module = await import("../agent/AssistantPanel");
  return { default: module.AssistantPanel };
});

type RightPopoutProps = {
  /** Currently active right activity bar panel. */
  readonly panel: RightPanel;
};

/**
 * Right dock popout for the desktop shell.
 *
 * Renders the active right inspector (outline, backlinks, properties, or the
 * AI assistant) inside a fixed-width sidebar. The width is driven by the
 * `--tn-shell-right-width` token and the surface collapses to an overlay on
 * viewports narrower than 760px.
 */
export function RightPopout({ panel }: RightPopoutProps) {
  const label = rightActions.find((item) => item.id === panel)?.label ?? "Panel";

  return (
    <aside
      className="flex flex-col min-w-0 overflow-hidden bg-sidebar border-l border-border flex-[0_0_var(--tn-shell-right-width)] max-[760px]:absolute max-[760px]:z-[2]"
      aria-label={`${label} panel`}
    >
      <PanelTitle title={label} />
      <RightContent panel={panel} />
    </aside>
  );
}

/**
 * Selects the body content for a given right panel id.
 *
 * The assistant panel is wrapped in a Suspense boundary so its lazy chunk
 * shows a loading placeholder while it loads. The remaining inspectors are
 * not yet wired to live data and render an {@link Unavailable} empty state.
 */
function RightContent({ panel }: { panel: RightPanel }) {
  if (panel === "assistant") {
    return (
      <Suspense fallback={<Unavailable title="Loading assistant" description="Preparing the assistant panel…" />}>
        <AssistantPanel />
      </Suspense>
    );
  }
  if (panel === "outline") {
    return <Unavailable title="No note selected" description="Headings from the active Markdown note will appear here." />;
  }
  if (panel === "backlinks") {
    return <Unavailable title="Backlinks unavailable" description="This inspector activates after the workspace link index is available." />;
  }
  // panel === "properties"
  return <Unavailable title="No note selected" description="Read-only frontmatter properties will appear here." />;
}
