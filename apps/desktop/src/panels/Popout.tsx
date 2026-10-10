import { type ReactNode } from "react";

import { Unavailable } from "../shell/Unavailable";
import { WorkspaceSwitchingSelector } from "../workspace/WorkspaceSwitching";
import { PanelBoundary } from "./PanelBoundary";
import { PanelTitle } from "./PanelTitle";
import { MountedPanel } from "./panelRegistry";
import {
  type DesktopPanelContribution,
  type DesktopPanelContext,
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

// The right dock stops docking at 900px — wider than the left's 760 because
// the title-bar buttons that reach it collapse into a menu at the same
// breakpoint. It overlays right-anchored and keeps its configured width,
// capped so the left rail and a sliver of editor stay uncovered instead of
// overflowing off the window's right edge.
const POPOUT_RIGHT =
  "max-[900px]:absolute max-[900px]:top-0 max-[900px]:bottom-0 max-[900px]:right-0 max-[900px]:z-30 max-[900px]:shadow-lg max-[900px]:w-[var(--tn-shell-right-width,320px)] max-[900px]:max-w-[calc(100%-var(--tn-size-activitybar-width))]";

// Desktop: slide in with smooth dock expansion. Mobile: no animation — PhoneShell wraps
// its LeftPopout reveal in its own slide-in div, and RightPopout arrives
// inside an inspector sheet that already slides in.
const SIDE_CLASS: Record<Side, string> = {
  left: `border-r border-border flex-[0_0_var(--tn-shell-left-width,288px)] ${POPOUT_LEFT} max-[760px]:right-0 tn-dock-slide-left max-[760px]:animate-none`,
  right: `border-l border-border flex-[0_0_var(--tn-shell-right-width,320px)] ${POPOUT_RIGHT} tn-dock-slide-right max-[760px]:animate-none`
};

const INNER_WIDTH: Record<Side, string> = {
  left: "w-[var(--tn-shell-left-width,288px)] max-[760px]:w-full",
  right: "w-[var(--tn-shell-right-width,320px)] max-[900px]:w-full"
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
  contributions,
  onBack,
  workspaceSelectorInPanel
}: {
  readonly side: Side;
  readonly panel: string;
  readonly context: Ctx;
  readonly contributions: readonly SideContribution<Ctx>[];
  /** Optional leading Back control in the panel header. */
  readonly onBack?: () => void;
  readonly workspaceSelectorInPanel?: boolean;
}): ReactNode {
  const contribution = contributions.find((candidate) => candidate.id === panel);
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

  // `ownsChrome` panels render their own single header row (the explorer
  // merges title, selector, and actions), so the popout mounts neither
  // PanelTitle nor a second selector for them.
  const ownsChrome = contribution.ownsChrome === true;
  // One chrome row per popout: when the setting places the selector in panel
  // headers, the trigger mounts inside the title slot — never its own row.
  const selectorInTitle =
    side === "left" &&
    workspaceSelectorInPanel === true &&
    contribution.showWorkspaceSelector === true;

  return (
    <aside className={className} aria-label={`${contribution.label} panel`}>
      <div className={`flex flex-col flex-1 min-h-0 ${INNER_WIDTH[side]}`}>
        {!ownsChrome && (
          // A failing action factory or header control degrades to a bare
          // label row — it may not take the whole popout down.
          <PanelBoundary
            label={contribution.label}
            fallback={
              <div className="flex h-9 items-center px-3 text-xs text-muted-foreground pointer-coarse:h-12">
                {contribution.label}
              </div>
            }
          >
            <PanelChrome
              contribution={contribution}
              context={context}
              selectorInTitle={selectorInTitle}
              onBack={onBack}
            />
          </PanelBoundary>
        )}
        {contributions.map((panelContribution) => {
          const isActive = panelContribution.id === panel;
          if (!isActive && !panelContribution.keepMounted) return null;
          // One boundary per panel: a crash shows in that panel's own slot
          // while the shell, and every sibling panel, keep working.
          return (
            <PanelBoundary key={panelContribution.id} label={panelContribution.label}>
              <MountedPanel
                contribution={panelContribution}
                context={context}
                isActive={isActive}
              />
            </PanelBoundary>
          );
        })}
      </div>
    </aside>
  );
}

/**
 * The popout's chrome row — the eyebrow label (or the selector trigger when
 * it lives in panel headers) plus the panel's actions.
 *
 * Action resolution lives here, inside the chrome's PanelBoundary, because
 * a context-derived action factory is invoked during render: if it throws,
 * only this row falls back.
 */
function PanelChrome<Ctx extends LeftPanelContext | RightPanelContext>({
  contribution,
  context,
  selectorInTitle,
  onBack
}: {
  readonly contribution: DesktopPanelContribution;
  readonly context: Ctx;
  readonly selectorInTitle: boolean;
  readonly onBack?: () => void;
}): ReactNode {
  // A contribution may declare actions as a factory over its side-narrowed
  // context — the only way an action can reach a shell callback like
  // `onOpenSyncSettings`. The registry stores the function under the wide
  // signature; each built-in reads only its own side's fields.
  const actions =
    typeof contribution.actions === "function"
      ? contribution.actions(context as unknown as DesktopPanelContext)
      : contribution.actions;
  return (
    <PanelTitle
      title={contribution.label}
      titleContent={selectorInTitle ? (
        <WorkspaceSwitchingSelector variant="panel" currentPath={context.rootPath ?? undefined} />
      ) : undefined}
      actions={actions}
      onBack={onBack}
    />
  );
}
