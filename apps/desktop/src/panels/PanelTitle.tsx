/**
 * Compact header bar for shell panels.
 *
 * Renders an uppercase tracked title and a trailing "more actions" affordance.
 * Used at the top of left/right dock panels.
 */
export function PanelTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between h-[2.25rem] px-3">
      <h2 className="m-0 text-[0.68rem] tracking-[0.08em] uppercase font-semibold">{title}</h2>
      <button className="bg-transparent border-0 cursor-pointer tracking-[0.12em]" aria-label={`More ${title} actions`}>•••</button>
    </div>
  );
}
