import type { DiffLayout } from "./diffLayout";

const LAYOUT_BUTTON =
  "rounded-small border-0 bg-transparent px-2 py-0.5 text-xs text-muted-foreground cursor-pointer hover:bg-accent aria-pressed:bg-accent aria-pressed:text-foreground focus-visible:outline-2 focus-visible:outline-ring";

/**
 * The Inline / Side by side segmented control, shared by the diff's own
 * toolbar and any caller that draws the toggle elsewhere (the merge tab puts
 * it in its actions bar).
 */
export function DiffLayoutToggle({
  layout,
  onLayoutChange
}: {
  readonly layout: DiffLayout;
  readonly onLayoutChange: (layout: DiffLayout) => void;
}) {
  return (
    <div role="group" aria-label="Diff layout" className="flex gap-0.5">
      <button
        type="button"
        className={LAYOUT_BUTTON}
        aria-pressed={layout === "inline"}
        onClick={() => onLayoutChange("inline")}
      >
        Inline
      </button>
      <button
        type="button"
        className={LAYOUT_BUTTON}
        aria-pressed={layout === "split"}
        onClick={() => onLayoutChange("split")}
      >
        Side by side
      </button>
    </div>
  );
}
