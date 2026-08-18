/**
 * Host-side panel/action icon registry.
 *
 * `packages/core` declares `PanelContribution.icon` and `ManifestPanel.icon` as
 * strings on purpose: core is platform-agnostic and the extension manifest is
 * JSON, so an extension can never hand the host a React component. The string
 * is an *identifier*, not a glyph (see the doc comment on
 * `PanelContribution.icon` in `packages/core/src/contributions.ts`).
 *
 * This module is where identifiers become renderable icons at the desktop
 * boundary. Built-in panels use names from this map; extensions that ship a
 * literal glyph (e.g. `✎`, `◫`) keep working via the glyph fallback in
 * {@link renderPanelIcon}.
 *
 * Add a name here before using it in a built-in panel or documenting it for
 * extension authors. Names are lowercase-kebab-case so they read naturally in
 * `extension.json`.
 */
import { createElement } from "react";
import {
  ArrowLeftRight,
  Blocks,
  Calendar,
  Clock,
  Files,
  History,
  Link,
  List,
  Plus,
  Pencil,
  RefreshCw,
  Search,
  Settings,
  Sigma,
  SlidersHorizontal,
  Sparkles,
  Tags,
  type LucideIcon
} from "lucide-react";

/** Identifier → lucide component. Keep names stable; they are a public API. */
export const panelIcons: Readonly<Record<string, LucideIcon>> = {
  // Activity bar (left)
  files: Files,
  search: Search,
  conflicts: ArrowLeftRight,
  history: History,
  tags: Tags,
  extensions: Blocks,
  // Action item menu / title bar (right)
  outline: List,
  backlinks: Link,
  properties: SlidersHorizontal,
  assistant: Sparkles,
  // Settings + chrome
  settings: Settings,
  // Panel header actions
  refresh: RefreshCw,
  "go-to-today": Clock,
  plus: Plus,
  pencil: Pencil,
  // Extension panels (named examples)
  calendar: Calendar,
  sum: Sigma
};

/**
 * Renders a panel/action icon by identifier, falling back to the literal string
 * when the identifier is unknown. Declared at module scope (not created during
 * render) so it satisfies `react-hooks/static-components`.
 *
 * `createElement` is used instead of `<Icon />` JSX because the icon component
 * is looked up by name at runtime; the static-components rule would otherwise
 * flag the capitalized variable as a component created during render.
 *
 * Lucide uses `stroke="currentColor"`, so the svg inherits the surrounding
 * text color — no dedicated icon color token is needed for theming.
 */
export function PanelIcon({ name, className }: {
  readonly name: string;
  /** Class applied to the svg when a named icon is resolved. */
  readonly className?: string;
}) {
  const Icon = panelIcons[name];
  if (Icon) return createElement(Icon, { className });
  return <>{name}</>;
}
