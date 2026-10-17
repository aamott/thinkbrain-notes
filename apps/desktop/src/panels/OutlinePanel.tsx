import { cn } from "../lib/utils";
import { Unavailable } from "../shell/Unavailable";
import { extractHeadings, type Heading } from "./outlineModel";

type OutlinePanelProps = {
  /** Current Markdown document contents, or null when no note is active. */
  readonly contents: string | null;
  /**
   * Jumps to a heading's 1-based line in the active document through shell
   * history. Omitted chromes get a read-only outline.
   */
  readonly onNavigate?: (line: number) => void;
};

type OutlineNode = {
  readonly heading: Heading;
  readonly children: OutlineNode[];
};

/**
 * Heading inspector for the active Markdown document.
 *
 * Rows are plain text until the chrome supplies `onNavigate`; with one they
 * become jump buttons that record a location-history visit.
 */
export function OutlinePanel({ contents, onNavigate }: OutlinePanelProps) {
  if (contents === null) {
    return <Unavailable title="No note selected" description="Open a Markdown note to view its headings." />;
  }

  const headings = extractHeadings(contents);
  if (headings.length === 0) {
    return <Unavailable title="No headings found" description="Add Markdown headings to build this note's outline." />;
  }

  return (
    <nav data-phone-scroll-clearance className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2" aria-label="Note outline">
      <OutlineList nodes={buildOutlineTree(headings)} onNavigate={onNavigate} />
    </nav>
  );
}

/**
 * Builds a semantic list hierarchy while preserving source order. Heading
 * levels can skip (for example, H1 to H3), which correctly nests the later
 * heading beneath the nearest preceding lower-level heading.
 */
function buildOutlineTree(headings: readonly Heading[]): readonly OutlineNode[] {
  const root: { level: number; children: OutlineNode[] } = { level: 0, children: [] };
  const stack: { level: number; children: OutlineNode[] }[] = [root];

  for (const heading of headings) {
    while (stack.at(-1)!.level >= heading.level) {
      stack.pop();
    }

    const node: OutlineNode = { heading, children: [] };
    stack.at(-1)!.children.push(node);
    stack.push({ level: heading.level, children: node.children });
  }

  return root.children;
}

const ROW_CLASS =
  "w-full rounded px-2 py-1 text-left text-xs leading-relaxed text-foreground pointer-coarse:min-h-11 pointer-coarse:flex pointer-coarse:items-center pointer-coarse:text-sm pointer-coarse:py-2";

function OutlineList({
  nodes,
  nested = false,
  onNavigate
}: {
  readonly nodes: readonly OutlineNode[];
  readonly nested?: boolean;
  readonly onNavigate?: (line: number) => void;
}) {
  return (
    <ul className={cn("m-0 list-none space-y-0.5 p-0", nested && "ml-3 border-l border-border pl-2")}>
      {nodes.map((node) => (
        <li key={`${node.heading.line}-${node.heading.text}`}>
          {onNavigate ? (
            <button
              type="button"
              className={cn(ROW_CLASS, "cursor-pointer border-0 bg-transparent font-inherit hover:bg-secondary focus-visible:outline-1 focus-visible:outline-ring")}
              title={`Go to ${node.heading.text}`}
              onClick={() => onNavigate(node.heading.line)}
            >
              {node.heading.text}
            </button>
          ) : (
            <div className={ROW_CLASS}>
              {node.heading.text}
            </div>
          )}
          {node.children.length > 0 && <OutlineList nodes={node.children} nested onNavigate={onNavigate} />}
        </li>
      ))}
    </ul>
  );
}
