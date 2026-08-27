/**
 * Identifier → lucide icon component map for built-in panels and actions.
 *
 * Split out of `panelIcons.tsx` so that file exports only the `PanelIcon`
 * React component, satisfying `react-refresh/only-export-components`. This map
 * is plain data (no JSX), so it lives in a `.ts` module.
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
 * `PanelIcon` (in `panelIcons.tsx`).
 *
 * Add a name here before using it in a built-in panel or documenting it for
 * extension authors. Names are lowercase-kebab-case so they read naturally in
 * `extension.json`.
 */
import {
  ArrowLeftRight,
  Blocks,
  Calendar,
  CalendarCheck2,
  CalendarDays,
  Files,
  Filter,
  History,
  Link,
  List,
  Menu,
  Notebook,
  NotebookPen,
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
  menu: Menu,
  // Panel header actions
  refresh: RefreshCw,
  // "Today" = a calendar with today's date checked. Visually distinct from
  // CalendarDays (the grid) used by the Open-calendar button beside it.
  "go-to-today": CalendarCheck2,
  filter: Filter,
  plus: Plus,
  pencil: Pencil,
  // Extension panels (named examples)
  calendar: Calendar,
  "calendar-days": CalendarDays,
  notebook: Notebook,
  "notebook-pen": NotebookPen,
  sum: Sigma
};
