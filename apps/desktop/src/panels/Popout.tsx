import { type ReactNode } from "react";

import { Unavailable } from "../shell/Unavailable";
import { PanelTitle } from "./PanelTitle";
import { MountedPanel } from "./panelRegistry";
import {
  getDesktopPanelOrUndefined,
  type DesktopPanelContribution,
  type LeftPanelContext,
  type RightPanelContext
} from "./panelRegistryModel";

type Side = "left" | "right";

// Below 760px a popout overlays the editor instead of docking beside it. Two
// edges are what give it a width: an absolutely positioned box with only one
// horizontal edge is shrink-to-fit, and the `flex-basis` beside it is inert
// because an abspos element is not a flex item.
//
// The left inset reserves the activity rail, which a *narrow desktop window*
// still renders — so it cannot simply be 0. It reads
// `--tn-shell-popout-left`, which `PhoneShell` publishes as `0px` on its own
// root because phone chrome has no rail; anywhere else the fallback keeps the
// rail uncovered.
const POPOUT_LEFT =
  "max-[760px]:left-[var(--tn-shell-popout-left,var(--tn-size-activitybar-width))]";

// Desktop: slide in from the edge. Mobile: no animation — PhoneShell wraps
// its LeftPopout reveal in its own slide-in div, and RightPopout arrives
// inside a BottomSheet that already slides up.
const SIDE_CLASS: Record<Side, string> = {
  left: `border-r border-border flex-[0_0_var(--tn-shell-left-width)] ${POPOUT_LEFT} max-[760px]:right-0 tn-slide-in-left max-[760px]:animate-none`,
  right: `border-l border-border flex-[0_0_var(--tn-shell-right-width)] max-[760px]:right-0 ${POPOUT_LEFT} tn-slide-in-right max-[760px]:animate-none`
};

const SHARED_CLASS =
  "flex flex-col min-w-0 overflow-hidden bg-sidebar max-[760px]:absolute max-[760px]:top-0 max-[760px]:bottom-0 max-[760px]:z-30 max-[760px]:shadow-lg";

type SideContribution<Ctx> = DesktopPanelContribution & {
  readonly side: Side;
  readonly factory: (ctx: Ctx) => ReactNode;
  readonly availability?: (context: Ctx) => boolean;
};

export function Popout<Ctx extends LeftPanelContext | RightPanelContext>({
  side,
  panel,
  context,
  contributions
}: {
  readonly side: Side;
  readonly panel: string;
  readonly context: Ctx;
  readonly contributions: readonly SideContribution<Ctx>[];
}): ReactNode {
  const contribution = getDesktopPanelOrUndefined(panel);
  const className = `${SHARED_CLASS} ${SIDE_CLASS[side]}`;

  if (!contribution) {
    return (
      <aside className={className} aria-label="Panel not available">
        <Unavailable
          title="Panel not available"
          description={`Panel '${panel}' is not registered.`}
        />
      </aside>
    );
  }

  return (
    <aside className={className} aria-label={`${contribution.label} panel`}>
      <PanelTitle title={contribution.label} actions={contribution.actions} />
      {contributions.map((panelContribution) => {
        const isActive = panelContribution.id === panel;
        if (!isActive && !panelContribution.keepMounted) return null;
        const isAvailable = panelContribution.availability?.(context) ?? true;
        return (
          <MountedPanel
            key={panelContribution.id}
            contribution={panelContribution}
            context={context}
            isActive={isActive}
            isAvailable={isAvailable}
          />
        );
      })}
    </aside>
  );
}
