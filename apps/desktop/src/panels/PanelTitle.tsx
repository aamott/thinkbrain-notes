import { ArrowLeft } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import type { PanelAction, PanelMenuItem } from "./panelRegistryModel";
import { Menu, MenuButton, MenuCheckbox, MenuSeparator } from "../shell/Menu";
import { PanelIcon } from "../shell/panelIcons";

const ACTION_BUTTON_CLASSES =
  "bg-transparent border-0 cursor-pointer px-1 text-muted-foreground hover:text-foreground pointer-coarse:min-h-9 pointer-coarse:min-w-9 pointer-coarse:px-1.5 [&>svg]:w-[0.9rem] [&>svg]:h-[0.9rem] [&>svg]:stroke-current pointer-coarse:[&>svg]:w-4 pointer-coarse:[&>svg]:h-4";

/** Runs a panel action or menu item, reporting `actionId` on failure. */
function runPanelAction(actionId: string, run?: () => void | Promise<void>): void {
  // A panel action is trusted code, but a throw here would otherwise escape
  // through the click handler and unmount the shell. Promise.resolve rather
  // than instanceof: an extension written in plain JS may return any
  // thenable, and an uncaught one becomes an unhandled rejection.
  try {
    void Promise.resolve(run?.()).catch((error: unknown) => {
      console.error(`[panels] Action "${actionId}" failed.`, error);
    });
  } catch (error: unknown) {
    console.error(`[panels] Action "${actionId}" failed.`, error);
  }
}

/**
 * Compact header bar for shell panels.
 *
 * Renders an uppercase tracked title and any actions the panel contributes.
 * Used at the top of left/right dock panels. A popout gets exactly one
 * chrome row — this is it — so a panel never re-renders its own name or a
 * second ⋯ menu below.
 *
 * `titleContent` replaces the eyebrow label — the workspace selector
 * trigger mounts there when its placement setting is "panel headers",
 * keeping the row a single line of chrome either way.
 *
 * Actions are data, not markup: a panel supplies a label, a glyph, and a
 * callback — or a `menu` item list for ⋯-style dropdowns, the only shape
 * that can express a checkbox item like "Show hidden files". Data keeps
 * the header identical whether the panel behind it is a first-party React
 * panel or an extension that mounted its own DOM.
 *
 * `action.icon` is resolved through {@link PanelIcon}: a known name renders a
 * themed lucide svg; an unknown string renders as a text glyph so existing
 * extensions (e.g. `hello-notes`'s `＋`) keep working.
 */
export function PanelTitle({
  title,
  titleContent,
  actions = [],
  onBack
}: {
  readonly title: string;
  /** Replaces the eyebrow label (e.g. the workspace selector trigger). */
  readonly titleContent?: ReactNode;
  readonly actions?: readonly PanelAction[];
  /**
   * Optional leading Back control. On desktop it closes the dock; on mobile it
   * steps the inspector flow back to whatever surface opened it.
   */
  readonly onBack?: () => void;
}) {
  return (
    <div className="flex items-center justify-between h-9 px-3 pointer-coarse:h-12 pointer-coarse:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {onBack && (
          <button
            type="button"
            aria-label={`Back from ${title}`}
            title="Back"
            className="bg-transparent border-0 cursor-pointer shrink-0 px-1 text-muted-foreground hover:text-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11 tn-focus-ring [&>svg]:w-4 [&>svg]:h-4 [&>svg]:stroke-current"
            onClick={onBack}
          >
            <ArrowLeft aria-hidden="true" />
          </button>
        )}
        {titleContent ?? (
          <h2 className="m-0 truncate text-[0.68rem] tracking-[0.08em] uppercase font-semibold pointer-coarse:text-sm pointer-coarse:tracking-normal pointer-coarse:normal-case pointer-coarse:font-semibold">
            {title}
          </h2>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 pointer-coarse:gap-2">
        {actions.map((action) =>
          action.menu ? (
            <PanelMenuAction key={action.id} action={action} />
          ) : (
            <button
              key={action.id}
              type="button"
              className={ACTION_BUTTON_CLASSES}
              aria-label={action.label}
              title={action.label}
              onClick={() => runPanelAction(action.id, action.run)}
            >
              <PanelIcon name={action.icon} />
            </button>
          )
        )}
      </div>
    </div>
  );
}

/** A ⋯-style action: an icon button that opens a dropdown menu. */
function PanelMenuAction({ action }: { readonly action: PanelAction }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        type="button"
        className={ACTION_BUTTON_CLASSES}
        aria-label={action.label}
        title={action.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <PanelIcon name={action.icon} />
      </button>
      {open && (
        <Menu
          label={action.label}
          className="absolute right-0 top-full z-50 mt-1"
          anchorRef={anchorRef}
          onClose={() => setOpen(false)}
        >
          {(action.menu ?? []).map((item, index) => (
            <PanelMenuEntry
              // Index in the key: extension-contributed menus may repeat a label.
              key={`${index}-${item.label}`}
              item={item}
              onRun={(close) => {
                if (close) setOpen(false);
                runPanelAction(action.id, item.run);
              }}
            />
          ))}
        </Menu>
      )}
    </div>
  );
}

/**
 * One row inside a panel action's menu. Plain buttons close the menu before
 * running; checkbox items stay open so a toggle's new state stays visible.
 */
function PanelMenuEntry({
  item,
  onRun
}: {
  readonly item: PanelMenuItem;
  readonly onRun: (close: boolean) => void;
}) {
  /**
   * A checkbox item keeps the menu open after a toggle, but `item.checked` is
   * static contribution data — without a local copy the still-open menu would
   * keep announcing the pre-toggle state until the contribution re-resolved.
   * The optimistic copy wins until a genuinely different `checked` arrives,
   * at which point the prop takes over again.
   */
  const [optimistic, setOptimistic] = useState<boolean | undefined>(undefined);
  const [seenChecked, setSeenChecked] = useState(item.checked);
  if (seenChecked !== item.checked) {
    // Render-phase adjustment: the contribution produced a new value, so the
    // optimistic copy has done its job.
    setSeenChecked(item.checked);
    setOptimistic(undefined);
  }
  const checked = optimistic ?? item.checked;

  const separator = item.separatorBefore && (
    <MenuSeparator />
  );
  if (item.disabled) {
    return (
      <>
        {separator}
        <div
          role="menuitem"
          aria-disabled="true"
          className="flex items-center justify-between gap-3 rounded-small px-2.5 py-1.5 text-[0.8125rem] text-muted-foreground"
        >
          <span className="truncate">{item.label}</span>
          {item.note && <span className="flex-none text-[0.68rem]">{item.note}</span>}
        </div>
      </>
    );
  }
  if (item.checked !== undefined) {
    return (
      <>
        {separator}
        <MenuCheckbox
          label={item.label}
          checked={checked ?? false}
          onClick={() => {
            setOptimistic(!checked);
            onRun(false);
          }}
        />
      </>
    );
  }
  return (
    <>
      {separator}
      <MenuButton
        label={item.label}
        icon={item.icon ? <PanelIcon name={item.icon} /> : undefined}
        danger={item.danger}
        onClick={() => onRun(true)}
      />
    </>
  );
}
