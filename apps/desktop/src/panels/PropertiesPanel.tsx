import { parseFrontmatter, type FrontmatterParseResult } from "@thinkbrain/core";
import { Unavailable } from "../shell/Unavailable";

type PropertiesPanelProps = {
  /** Current Markdown document contents, or null when no note is active. */
  readonly contents: string | null;
};

type MetadataRow = {
  readonly label: string;
  readonly value: string | readonly string[] | undefined;
};

/**
 * Read-only YAML frontmatter inspector for the active Markdown document.
 *
 * Parsing remains owned by `@thinkbrain/core`; this panel only presents its
 * normalized metadata and diagnostics, and never writes back to the document.
 */
export function PropertiesPanel({ contents }: PropertiesPanelProps) {
  if (contents === null) {
    return <Unavailable title="No note selected" description="Open a Markdown note to view its frontmatter." />;
  }

  const result = parseFrontmatter(contents);

  if (result.frontmatter === null && result.diagnostics.length === 0) {
    return <Unavailable title="No frontmatter" description="Add a YAML frontmatter block at the start of this note to view its properties." />;
  }

  if (result.frontmatter === null) {
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3" aria-label="Note properties">
        <h3 className="m-0 text-sm font-semibold text-foreground">Invalid frontmatter</h3>
        <p className="mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">
          Fix the frontmatter diagnostics before its properties can be displayed.
        </p>
        <FrontmatterDiagnostics result={result} />
      </section>
    );
  }

  const metadataRows: readonly MetadataRow[] = [
    { label: "Title", value: result.metadata.title },
    { label: "Tags", value: result.metadata.tags },
    { label: "Aliases", value: result.metadata.aliases },
    { label: "Status", value: result.metadata.status },
    { label: "Created", value: result.metadata.created_at },
    { label: "Updated", value: result.metadata.updated_at },
  ];

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3" aria-label="Note properties">
      {result.diagnostics.length > 0 && <FrontmatterDiagnostics result={result} />}
      <table className="w-full border-collapse text-left text-xs">
        <caption className="sr-only">Read-only note frontmatter properties</caption>
        <tbody>
          {metadataRows.map((row) => (
            <tr key={row.label} className="border-b border-border last:border-b-0">
              <th scope="row" className="w-[38%] py-2 pr-3 align-top font-medium text-muted-foreground">
                {row.label}
              </th>
              <td className="break-words py-2 align-top text-foreground">{formatMetadataValue(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Renders core parser diagnostics without duplicating validation in the UI. */
function FrontmatterDiagnostics({ result }: { readonly result: FrontmatterParseResult }) {
  const hasError = result.diagnostics.some((diagnostic) => diagnostic.severity === "error");

  return (
    <div
      className="mb-3 rounded-md border border-border bg-muted p-2 text-xs"
      role={hasError ? "alert" : "status"}
      aria-label="Frontmatter diagnostics"
    >
      <strong className="text-foreground">Frontmatter diagnostics</strong>
      <ul className="mb-0 mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
        {result.diagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.code}-${diagnostic.line ?? 0}-${index}`}>
            {diagnostic.severity === "error" ? "Error" : "Warning"}: {diagnostic.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Converts normalized core metadata into the table's read-only display text. */
function formatMetadataValue(value: MetadataRow["value"]): string {
  if (typeof value === "string") {
    return value;
  }

  return value && value.length > 0 ? value.join(", ") : "—";
}
