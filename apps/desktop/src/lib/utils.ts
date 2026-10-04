// `cn` lives in @thinkbrain/ui so the app and the design system share one
// tailwind-merge implementation; it is re-exported for existing importers.
export { cn } from "@thinkbrain/ui";

/** The file name out of a workspace-relative path. */
export function noteName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

/**
 * A note's display title: the frontmatter `title` when it has visible text,
 * otherwise the file name without its Markdown extension.
 */
export function noteTitle(title: string | null | undefined, fileName: string): string {
  return title?.trim() || fileName.replace(/\.(md|markdown)$/i, "");
}
