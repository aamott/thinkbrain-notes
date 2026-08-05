import { lazy, Suspense } from "react";
import { cn } from "../lib/utils";
import { createDesktopTabRegistry } from "../tabs/tabRegistry";
import type { DesktopTab } from "../tabs/tabModel";
import type { DocumentViewState } from "./shellTypes";
import { SettingsTab } from "../settings/SettingsTab";
import { Unavailable } from "./Unavailable";

/**
 * Props for the active tab content surface.
 */
type TabContentProps = {
  readonly tab: DesktopTab | null;
  readonly document: DocumentViewState | undefined;
  readonly onChange: (tabId: string, contents: string) => void;
  readonly onSave: (tab: DesktopTab) => Promise<boolean>;
};

/** Module-scoped registry describing which tab kinds are available. */
const desktopTabRegistry = createDesktopTabRegistry();

/** Lazy-loaded Markdown editor; only fetched when an editor tab is rendered. */
const MarkdownEditor = lazy(async () => {
  const module = await import("../tabs/MarkdownEditor");
  return { default: module.MarkdownEditor };
});

/**
 * Renders the body of the active editor tab.
 *
 * Switches on `tab.kind` to pick the right surface. Most non-editor kinds are
 * not yet backed by a service and show an `Unavailable` placeholder. Editor
 * tabs render the lazy-loaded `MarkdownEditor` once the document is ready.
 */
export function TabContent({ tab, document, onChange, onSave }: TabContentProps) {
  if (!tab) {
    return (
      <div className="grid grid-cols-[3.2rem_minmax(0,1fr)] py-[1.1rem] font-mono text-[0.84rem] leading-[1.65]">
        <span className="text-muted-foreground pr-[0.8rem] text-right select-none">1</span>
        <pre className={cn("m-0 overflow-visible whitespace-pre-wrap")}>
          {`# Welcome to ThinkBrain\n\nOpen a workspace, then select a Markdown file to start editing it.`}
        </pre>
      </div>
    );
  }

  const view = desktopTabRegistry.get(tab.kind);
  if (!view?.isAvailable) {
    return (
      <Unavailable
        title={view?.label ?? tab.title}
        description={view?.unavailableMessage ?? "This tab type is unavailable."}
      />
    );
  }

  if (tab.kind === "browser") {
    return (
      <Unavailable
        title="Browser tab"
        description="External page rendering is unavailable until the Tauri browser view is connected."
      />
    );
  }

  if (tab.kind === "graph") {
    return (
      <Unavailable
        title="Graph view"
        description="Graph visualization is planned after link indexing is available."
      />
    );
  }

  if (tab.kind === "preview") {
    return (
      <div className="my-8 mx-auto max-w-[42rem] px-8 leading-[1.6]">
        <h1 className="text-[2rem]">Preview unavailable</h1>
        <p>Open a Markdown note to view its rendered preview.</p>
      </div>
    );
  }

  if (tab.kind === "settings") {
    return <SettingsTab />;
  }

  if (!document || document.phase === "loading") {
    return (
      <Unavailable
        title="Loading note"
        description="Reading the Markdown document from the workspace…"
      />
    );
  }

  if (document.phase === "error" && !document.contents) {
    return (
      <Unavailable
        title="Could not open note"
        description={document.error ?? "The Markdown document could not be read."}
      />
    );
  }

  return (
    <Suspense
      fallback={<Unavailable title="Loading editor" description="Preparing the Markdown editor…" />}
    >
      <MarkdownEditor
        key={tab.id}
        value={document.contents}
        isSaving={document.phase === "saving"}
        error={document.error}
        onChange={(contents) => onChange(tab.id, contents)}
        onSave={() => {
          void onSave(tab);
        }}
      />
    </Suspense>
  );
}
