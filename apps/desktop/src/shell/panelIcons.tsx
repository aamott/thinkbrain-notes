/**
 * Renders a panel/action icon by identifier, falling back to the literal string
 * when the identifier is unknown.
 *
 * The identifier → lucide component map lives in `panelIconsModel.ts` so this
 * file exports only the `PanelIcon` React component
 * (`react-refresh/only-export-components`).
 *
 * `createElement` is used instead of `<Icon />` JSX because the icon component
 * is looked up by name at runtime; the static-components rule would otherwise
 * flag the capitalized variable as a component created during render.
 * Declared at module scope (not created during render) so it satisfies
 * `react-hooks/static-components`.
 *
 * Lucide uses `stroke="currentColor"`, so the svg inherits the surrounding
 * text color — no dedicated icon color token is needed for theming.
 */
import { createElement } from "react";
import { panelIcons } from "./panelIconsModel";

export function PanelIcon({ name, className }: {
  readonly name: string;
  /** Class applied to the svg when a named icon is resolved. */
  readonly className?: string;
}) {
  const Icon = panelIcons[name];
  if (Icon) return createElement(Icon, { className });
  return <>{name}</>;
}
