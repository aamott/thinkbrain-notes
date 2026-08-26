/**
 * Reads back the phone's bottom-bar shortcuts, and offers the way out.
 *
 * The hub is built by long-pressing on the phone itself, which is the right
 * place for it — this control exists because the setting is stored as a JSON
 * string, and without it the registry falls back to a plain text box. Handing
 * someone the raw `[{"kind":"panel","id":"explorer"}…]` invites them to break
 * their own navigation bar by hand.
 *
 * So it shows what is pinned, in order, by the same labels the phone uses, and
 * offers a reset. That is deliberately less than the phone can do: duplicating
 * pin and remove here would be a second editor to keep in step, for a surface
 * the person reading it is not currently looking at.
 */

import { useDesktopCommands } from "../../commands/commandRegistry";
import {
  useLeftPanelContributions,
  useRightPanelContributions
} from "../../panels/panelRegistryModel";
import { parseHubItems, resolveHubItems } from "../../shell/phone/hubModel";
import { inputClassName, type ControlProps } from "../controlRegistry";

export function MobileHubControl({ value, onChange, disabled }: ControlProps) {
  const left = useLeftPanelContributions();
  const right = useRightPanelContributions();
  const commands = useDesktopCommands();

  const items = parseHubItems(typeof value === "string" ? value : "");
  // Badges and active state are the phone's business; this is a reading of the
  // list, so both are empty here.
  const resolved = resolveHubItems(items, {
    panels: [...left, ...right],
    commands,
    activeLeftPanel: null,
    activeRightPanel: null,
    badges: {}
  });

  const isDefault = typeof value !== "string" || value.trim().length === 0;

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {resolved.map((entry, index) => (
          <li
            key={entry.key}
            className="rounded-small border border-border bg-surface px-2 py-1 text-xs text-foreground"
          >
            <span className="text-muted-foreground">{index + 1}. </span>
            {entry.label}
          </li>
        ))}
      </ol>

      <p className="m-0 text-xs leading-relaxed text-muted-foreground">
        {isDefault
          ? "These are the defaults. On a phone, press and hold a section in the navigation drawer to pin it here, or press and hold a shortcut to remove it."
          : "Press and hold a section in the phone's navigation drawer to pin it here, or press and hold a shortcut to remove it."}
      </p>

      <button
        type="button"
        disabled={disabled || isDefault}
        onClick={() => onChange("")}
        className={`${inputClassName} w-fit cursor-pointer text-xs disabled:cursor-not-allowed disabled:opacity-50`}
      >
        Reset to defaults
      </button>
    </div>
  );
}
