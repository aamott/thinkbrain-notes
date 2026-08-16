import type { PanelAction } from "./panelRegistry";

/**
 * Compact header bar for shell panels.
 *
 * Renders an uppercase tracked title and any actions the panel contributes.
 * Used at the top of left/right dock panels.
 *
 * Actions are data, not markup: a panel supplies a label, a glyph, and a
 * callback. That keeps the header identical whether the panel behind it is a
 * first-party React panel or an extension that mounted its own DOM, and it is
 * why an extension can contribute header buttons without rendering anything.
 */
export function PanelTitle({
  title,
  actions = []
}: {
  readonly title: string;
  readonly actions?: readonly PanelAction[];
}) {
  const run = (action: PanelAction): void => {
    // A panel action is trusted code, but a throw here would otherwise escape
    // through the click handler and unmount the shell.
    try {
      const result = action.run();
      if (result instanceof Promise) {
        void result.catch((error: unknown) => {
          console.error(`[panels] Action "${action.id}" failed.`, error);
        });
      }
    } catch (error: unknown) {
      console.error(`[panels] Action "${action.id}" failed.`, error);
    }
  };

  return (
    <div className="flex items-center justify-between h-9 px-3">
      <h2 className="m-0 text-[0.68rem] tracking-[0.08em] uppercase font-semibold">{title}</h2>
      <div className="flex items-center gap-1">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="bg-transparent border-0 cursor-pointer px-1 text-muted-foreground hover:text-foreground"
            aria-label={action.label}
            title={action.label}
            onClick={() => run(action)}
          >
            {action.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
