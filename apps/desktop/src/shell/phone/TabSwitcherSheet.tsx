import { BottomSheet } from "@thinkbrain/ui";
import { X } from "lucide-react";

import { cn } from "../../lib/utils";
import type { DesktopTab } from "../../tabs/tabModel";
import type { DocumentViewState } from "../shellTypes";
import { previewText } from "./tabPreview";

/**
 * What a card shows when there is no prose to excerpt.
 *
 * A tab whose document is still in flight is not the same as one that can never
 * have text — a restored editor loads eagerly but not instantly, and naming its
 * kind ("editor") would tell the user nothing. Settings, merge and unavailable
 * kinds get a placard naming the kind, as the spec asks.
 */
function placeholderFor(tab: DesktopTab, view: DocumentViewState | undefined): string {
  if (view?.phase === "loading") return "Loading…";
  if (view?.phase === "error") return "Unavailable";
  return tab.kind;
}

/**
 * Open tabs as a grid of preview cards, reached from the header's count button.
 *
 * A grid rather than a list because that is what a phone user already knows from
 * a browser, and because two columns of cards fit more tabs on screen than rows
 * of titles. The preview is a text excerpt: see `tabPreview.ts` for why a real
 * screenshot is neither available nor desirable here.
 */
export function TabSwitcherSheet({
  open,
  tabs,
  activeTabId,
  documents,
  onDismiss,
  onSelect,
  onClose
}: {
  readonly open: boolean;
  readonly tabs: readonly DesktopTab[];
  readonly activeTabId: string | null;
  readonly documents: Readonly<Record<string, DocumentViewState>>;
  readonly onDismiss: () => void;
  readonly onSelect: (tabId: string) => void;
  readonly onClose: (tabId: string) => void;
}) {
  return (
    <BottomSheet open={open} onDismiss={onDismiss} label="Open tabs">
      {tabs.length === 0 ? (
        // Closing the last tab leaves this sheet open over an empty workspace.
        // An empty grid is a blank rectangle that explains nothing.
        <p className="m-0 p-6 text-center text-xs text-muted-foreground">
          No open tabs. Choose a note from Files to start one.
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-3">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const view = documents[tab.id];
            const excerpt = view ? previewText(view.contents) : "";
            return (
              <li key={tab.id} className="relative m-0">
                {/*
                 * The whole card selects; the ✕ overlays its corner as a
                 * sibling, never a child. A button inside a button is invalid
                 * HTML and the close tap would bubble straight into selection.
                 */}
                <button
                  type="button"
                  aria-label={tab.title}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex h-44 w-full cursor-pointer flex-col items-stretch overflow-hidden rounded-medium border border-border bg-tab-active p-0 text-left text-tab-active-foreground tn-focus-ring",
                    isActive && "border-primary ring-2 ring-primary"
                  )}
                  onClick={() => {
                    onSelect(tab.id);
                    onDismiss();
                  }}
                >
                  <span className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-surface pr-9 pl-2 pointer-coarse:h-11 pointer-coarse:pr-11">
                    <span className="min-w-0 flex-1 truncate text-[0.7rem] font-medium">
                      {tab.title}
                    </span>
                    {tab.isDirty && (
                      <span
                        aria-label="Unsaved changes"
                        role="img"
                        className="size-[0.35rem] shrink-0 rounded-full bg-primary"
                      />
                    )}
                  </span>
                  {excerpt.length > 0 ? (
                    <span className="line-clamp-6 flex-1 overflow-hidden p-2 text-[0.6rem] leading-relaxed text-muted-foreground">
                      {excerpt}
                    </span>
                  ) : (
                    <span className="flex-1 overflow-hidden p-2 text-[0.6rem] text-muted-foreground italic">
                      {placeholderFor(tab, view)}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`Close ${tab.title}`}
                  className="absolute top-0 right-0 flex size-9 cursor-pointer items-center justify-center rounded-medium border-0 bg-transparent text-muted-foreground hover:text-foreground tn-focus-ring pointer-coarse:size-11"
                  onClick={() => onClose(tab.id)}
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </BottomSheet>
  );
}
