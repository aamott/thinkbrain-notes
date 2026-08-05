import { cn } from "../lib/utils";
import { Unavailable } from "../shell/Unavailable";
import { extractHeadings, type Heading } from "./outlineModel";

type OutlinePanelProps = {
  /** Current Markdown document contents, or null when no note is active. */
  readonly contents: string | null;
  /** Requests that the active editor move focus to a 1-based document line. */
  readonly onNavigate?: (line: number) => void;
};

type OutlineNode = {
  readonly heading: Heading;
  readonly level: number;
  readonly children: OutlineNode[];
};

/**
 * Read-only heading inspector for the active Markdown document.
 *
 * Native buttons make every heading keyboard reachable. The optional callback
 * lets the owning editor integration navigate without this inspector mutating
 * the document or owning editor state.
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
    <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2" aria-label="Note outline">
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
  const root: { level: 0; children: OutlineNode[] } = { level: 0, children: [] };
  const stack: Array<{ level: number; children: OutlineNode[] }> = [root];

  for (const heading of headings) {
    while (stack.at(-1)!.level >= heading.level) {
      stack.pop();
    }

    const node: OutlineNode = { heading, level: heading.level, children: [] };
    stack.at(-1)!.children.push(node);
    stack.push(node);
  }

  return root.children;
}

function OutlineList({
  nodes,
  onNavigate,
  nested = false,
}: {
  readonly nodes: readonly OutlineNode[];
  readonly onNavigate: OutlinePanelProps["onNavigate"];
  readonly nested?: boolean;
}) {
  return (
    <ul className={cn("m-0 list-none space-y-0.5 p-0", nested && "ml-3 border-l border-border pl-2")}>
      {nodes.map((node) => (
        <li key={`${node.heading.line}-${node.heading.text}`}>
          <button
            type="button"
            className="w-full rounded px-2 py-1 text-left text-xs leading-relaxed text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
            onClick={() => onNavigate?.(node.heading.line)}
            aria-label={`Go to line ${node.heading.line}: ${node.heading.text}`}
          >
            {node.heading.text}
          </button>
          {node.children.length > 0 && <OutlineList nodes={node.children} onNavigate={onNavigate} nested />}
        </li>
      ))}
    </ul>
  );
}
