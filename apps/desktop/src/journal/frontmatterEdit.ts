import type { JournalFieldValue } from "@thinkbrain/core";

/**
 * Sets one frontmatter key, touching nothing else.
 *
 * A textual edit rather than a parse-and-reserialize: the user's key order,
 * comments, blank lines and quoting style are theirs, and a note opened to
 * record a mood should not come back reformatted (D33/D50).
 *
 * A note whose block cannot be understood is returned unchanged. Declining is
 * always safe; guessing at a repair is not.
 */

const OPEN = /^---[ \t]*\r?\n/;

/** YAML would read these as something other than a string, so they get quoted. */
const AMBIGUOUS = /^(?:-?\d+(?:\.\d+)?|true|false|yes|no|on|off|null|~)$/i;
const NEEDS_QUOTES = /[:#\n"']|^\s|\s$|^$/;

function quote(value: string): string {
  if (AMBIGUOUS.test(value) || NEEDS_QUOTES.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

function format(value: JournalFieldValue): string {
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `[${value.map((entry) => quote(entry)).join(", ")}]`;
  return quote(value as string);
}

export function setFrontmatterField(
  contents: string,
  key: string,
  value: JournalFieldValue | undefined
): string {
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  const opening = OPEN.exec(contents);

  if (!opening) {
    // Nothing to clear, and no reason to add a block for an absent value.
    if (value === undefined) return contents;
    return `---${newline}${key}: ${format(value)}${newline}---${newline}${newline}${contents}`;
  }

  const bodyStart = opening[0].length;
  const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(contents.slice(bodyStart));
  if (!closing) return contents;

  const blockEnd = bodyStart + closing.index;
  const block = contents.slice(bodyStart, blockEnd);
  const rest = contents.slice(blockEnd);

  const lines = block.split(/\r?\n/);
  // A trailing empty element from the final newline; kept so the block ends the
  // way it started.
  const trailing = lines.at(-1) === "" ? lines.pop() : undefined;
  const index = lines.findIndex((line) =>
    new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`).test(line)
  );

  if (value === undefined) {
    if (index === -1) return contents;
    lines.splice(index, 1);
  } else if (index === -1) {
    lines.push(`${key}: ${format(value)}`);
  } else {
    lines[index] = `${key}: ${format(value)}`;
  }

  if (trailing !== undefined) lines.push(trailing);
  return contents.slice(0, bodyStart) + lines.join(newline) + rest;
}
