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

const SIDE_CLASS: Record<Side, string> = {
  left: "border-r border-border flex-[0_0_var(--tn-shell-left-width)] max-[760px]:left-[var(--tn-size-activitybar-width)]",
  right: "border-l border-border flex-[0_0_var(--tn-shell-right-width)] max-[760px]:right-0"
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
