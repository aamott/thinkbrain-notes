import {
  createTabRegistry,
  type Tab,
  type TabKind,
  type TabRegistration
} from "@thinkbrain/core";
import type { ReactNode } from "react";

import { MarkdownEditor } from "../editor/MarkdownEditor";
import { SettingsPanel } from "../settings/SettingsPanel";
import { PreviewTab, UnavailableTab } from "./TabViews";

export interface DesktopTabContribution extends TabRegistration {
  readonly render: (tab: Tab) => ReactNode;
}

export interface DesktopTabRegistry {
  get(kind: TabKind): DesktopTabContribution | undefined;
  register(contribution: DesktopTabContribution): void;
}

export function createDesktopTabRegistry(
  extensionContributions: readonly DesktopTabContribution[] = []
): DesktopTabRegistry {
  const coreRegistry = createTabRegistry();
  const contributions = new Map<TabKind, DesktopTabContribution>();

  const register = (contribution: DesktopTabContribution) => {
    coreRegistry.register(contribution);
    contributions.set(contribution.kind, contribution);
  };

  for (const contribution of [
    ...firstPartyContributions,
    ...extensionContributions
  ]) {
    register(contribution);
  }

  return { get: (kind) => contributions.get(kind), register };
}

const firstPartyContributions: readonly DesktopTabContribution[] = [
  { kind: "editor", label: "Editor", isAvailable: true, render: () => <MarkdownEditor /> },
  { kind: "preview", label: "Preview", isAvailable: true, render: (tab) => <PreviewTab tab={tab} /> },
  { kind: "settings", label: "Settings", isAvailable: true, render: () => <SettingsPanel /> },
  { kind: "graph", label: "Graph", isAvailable: false, render: () => <UnavailableTab feature="Graph" detail="The graph epic owns this view." /> },
  { kind: "browser", label: "Browser", isAvailable: false, render: () => <UnavailableTab feature="Browser tabs" detail="Browser content needs a separate security and capability design." /> }
];

export const desktopTabRegistry = createDesktopTabRegistry();
