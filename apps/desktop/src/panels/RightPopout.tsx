import { lazy, Suspense } from "react";
import { cn } from "../lib/utils";
import { PanelTitle } from "./PanelTitle";
import { OutlinePanel } from "./OutlinePanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { Unavailable } from "../shell/Unavailable";
import { rightActions, type RightPanel } from "../shell/shellTypes";

/**
 * Lazy-loaded AI assistant panel.
 *
 * The AI epic owns this integration component. It remains code-split from the
 * shell, then stays mounted with the other stateful right inspectors.
 */
const AssistantPanel = lazy(async () => {
  const module = await import("../agent/AssistantPanel");
  return { default: module.AssistantPanel };
});

type RightPopoutProps = {
  /** Currently active right activity bar panel. */
  readonly panel: RightPanel;
  /** Markdown contents of the active editor tab, when its document is ready. */
  readonly documentContents: string | null;
};

/**
 * Right dock popout for the desktop shell.
 *
 * Renders the active right inspector (outline, backlinks, properties, or the
 * AI assistant) inside a fixed-width sidebar. The width is driven by the
 * `--tn-shell-right-width` token and the surface collapses to an overlay on
 * viewports narrower than 760px.
 */
export function RightPopout({ panel, documentContents }: RightPopoutProps) {
  const label = rightActions.find((item) => item.id === panel)?.label ?? "Panel";

  return (
    <aside
      className="flex flex-col min-w-0 overflow-hidden bg-sidebar border-l border-border flex-[0_0_var(--tn-shell-right-width)] max-[760px]:absolute max-[760px]:z-[2]"
      aria-label={`${label} panel`}
    >
      <PanelTitle title={label} />
      {/*
       * Inspector panels remain mounted through activity-bar switches so
       * presentation state (such as scrolling) survives without affecting the
       * active editor or its unsaved document contents.
       */}
      <div className={cn("flex min-h-0 flex-1 flex-col", panel !== "outline" && "hidden")}>
        <OutlinePanel contents={documentContents} />
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", panel !== "properties" && "hidden")}>
        <PropertiesPanel contents={documentContents} />
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", panel !== "assistant" && "hidden")}>
        <Suspense fallback={<Unavailable title="Loading assistant" description="Preparing the assistant panel…" />}>
          <AssistantPanel />
        </Suspense>
      </div>
      {panel === "backlinks" && (
        <Unavailable
          title="Backlinks unavailable"
          description="This inspector activates after the workspace link index is available."
        />
      )}
    </aside>
  );
}
