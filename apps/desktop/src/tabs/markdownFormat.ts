import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type SelectionRange,
  type TransactionSpec
} from "@codemirror/state";

/**
 * Markdown formatting actions offered by the phone's soft-keyboard bar.
 *
 * Pure model: every action maps an `EditorState` to a `TransactionSpec` the
 * caller dispatches — multi-cursor safe via `state.changeByRange`, tagged
 * `input.format` so the edits read as deliberate user input to filters.
 */
export type MarkdownFormatAction =
  | "bold"
  | "italic"
  | "strikethrough"
  | "code"
  | "heading"
  | "bullet-list"
  | "numbered-list"
  | "task-list"
  | "quote"
  | "link";

const INLINE_MARKERS: Partial<Record<MarkdownFormatAction, string>> = {
  bold: "**",
  italic: "*",
  strikethrough: "~~",
  code: "`"
};

const LINE_PREFIXES: Partial<Record<MarkdownFormatAction, string>> = {
  "bullet-list": "- ",
  "numbered-list": "1. ",
  "task-list": "- [ ] ",
  quote: "> "
};

/** List or task marker after leading indentation, capturing the indent. */
const LIST_MARKER = /^(\s*)([-*+] \[[ xX]\] |[-*+] |\d+[.)] )/;
/** A level-1..6 ATX heading prefix, capturing the indent. */
const HEADING_MARKER = /^(\s*)#{1,6} /;

/** Whether `line` already carries the prefix for `action`. */
const hasLinePrefix = (line: string, action: MarkdownFormatAction): boolean => {
  switch (action) {
    case "bullet-list":
      // Any unordered marker, but not a task item.
      return /^\s*[-*+] (?!\[[ xX]\] )/.test(line);
    case "numbered-list":
      return /^\s*\d+[.)] /.test(line);
    case "task-list":
      return /^\s*[-*+] \[[ xX]\] /.test(line);
    case "quote":
      return /^\s*>/.test(line);
    default:
      return false;
  }
};

/** Position `pos` mapped across `specs`, which must be in document order. */
const mapPos = (pos: number, specs: readonly { from: number; to: number; insert: string }[]): number => {
  let mapped = pos;
  for (const spec of specs) {
    if (spec.from > pos) break;
    mapped += spec.insert.length - (spec.to - spec.from);
  }
  return mapped;
};

/**
 * Maps `range` over the lines it touches for a line-prefix action: if every
 * non-empty line already has the prefix it is removed, otherwise list/task
 * markers are stripped and the prefix added after the indentation. Returns
 * the changes plus the range's new position, in post-change coordinates.
 */
const lineSpec = (
  state: EditorState,
  range: SelectionRange,
  action: "bullet-list" | "numbered-list" | "task-list" | "quote"
): { specs: ChangeSpec[]; anchor: number; head: number } => {
  const doc = state.doc;
  const first = doc.lineAt(range.from);
  const last = doc.lineAt(range.to);
  const lines = [];
  for (let number = first.number; number <= last.number; number++) {
    lines.push(doc.line(number));
  }
  const nonEmpty = lines.filter((line) => line.text.trim() !== "");
  const remove = nonEmpty.length > 0 && nonEmpty.every((line) => hasLinePrefix(line.text, action));

  const specs: { from: number; to: number; insert: string }[] = [];
  for (const line of lines) {
    if (line.text.trim() === "" && !remove) continue;
    const text = line.text;
    if (remove) {
      // Quote lines keep their indentation and lose one `>`; list markers are
      // captured by LIST_MARKER after the indent group.
      const match = action === "quote" ? /^\s*> ?/.exec(text) : LIST_MARKER.exec(text);
      if (match) {
        const indentLength = (action === "quote" ? /^\s*/.exec(match[0])?.[0] : match[1])?.length ?? 0;
        specs.push({ from: line.from + indentLength, to: line.from + match[0].length, insert: "" });
      }
      continue;
    }
    const indent = /^\s*/.exec(text)?.[0] ?? "";
    const stripped = action === "quote" ? null : LIST_MARKER.exec(text);
    const markerEnd = stripped ? stripped[0].length : indent.length;
    specs.push({ from: line.from + indent.length, to: line.from + markerEnd, insert: LINE_PREFIXES[action]! });
  }

  return {
    specs,
    anchor: mapPos(range.anchor, specs),
    head: mapPos(range.head, specs)
  };
};

/** Cycles the heading level of the lines `range` touches: none → # → ## → ### → none. */
const headingSpec = (
  state: EditorState,
  range: SelectionRange
): { specs: ChangeSpec[]; anchor: number; head: number } => {
  const doc = state.doc;
  const first = doc.lineAt(range.from);
  const last = doc.lineAt(range.to);
  const level = (HEADING_MARKER.exec(first.text)?.[0].match(/#+/)?.[0].length ?? 0);
  const next = level >= 3 ? 0 : level + 1;

  const specs: { from: number; to: number; insert: string }[] = [];
  for (let number = first.number; number <= last.number; number++) {
    const line = doc.line(number);
    const match = HEADING_MARKER.exec(line.text);
    const indentLength = /^\s*/.exec(line.text)?.[0].length ?? 0;
    specs.push({
      from: line.from + (match ? (match[1]?.length ?? 0) : indentLength),
      to: line.from + (match ? match[0].length : indentLength),
      insert: next === 0 ? "" : `${"#".repeat(next)} `
    });
  }

  return {
    specs,
    anchor: mapPos(range.anchor, specs),
    head: mapPos(range.head, specs)
  };
};

/** Wraps (or unwraps) `range` in an inline marker, keeping the text selected. */
const inlineSpec = (
  state: EditorState,
  range: SelectionRange,
  marker: string
): { specs: ChangeSpec[]; anchor: number; head: number } => {
  const doc = state.doc;
  const m = marker.length;
  if (range.empty) {
    // No selection: drop a marker pair and leave the cursor inside it.
    return { specs: [{ from: range.from, to: range.from, insert: marker + marker }], anchor: range.from + m, head: range.from + m };
  }
  const selected = doc.sliceString(range.from, range.to);
  const before = doc.sliceString(Math.max(0, range.from - m), range.from);
  const after = doc.sliceString(range.to, Math.min(doc.length, range.to + m));
  if (before === marker && after === marker) {
    // Markers immediately outside the selection: unwrap the pair.
    return {
      specs: [
        { from: range.from - m, to: range.from, insert: "" },
        { from: range.to, to: range.to + m, insert: "" }
      ],
      anchor: range.from - m,
      head: range.to - m
    };
  }
  if (selected.length > 2 * m && selected.startsWith(marker) && selected.endsWith(marker)) {
    // The selection itself includes the markers: unwrap inside it.
    return {
      specs: [
        { from: range.from, to: range.from + m, insert: "" },
        { from: range.to - m, to: range.to, insert: "" }
      ],
      anchor: range.from,
      head: range.to - 2 * m
    };
  }
  return {
    specs: [
      { from: range.from, to: range.from, insert: marker },
      { from: range.to, to: range.to, insert: marker }
    ],
    anchor: range.from + m,
    head: range.to + m
  };
};

/**
 * Builds the dispatch for `action` on `state`. Every spec carries
 * `userEvent: "input.format"` and `scrollIntoView` — format edits are user
 * input and must keep the caret visible above the keyboard.
 */
export function markdownFormat(state: EditorState, action: MarkdownFormatAction): TransactionSpec {
  const marker = INLINE_MARKERS[action];
  const result = state.changeByRange((range) => {
    if (action === "heading") {
      const { specs, anchor, head } = headingSpec(state, range);
      return { changes: specs, range: EditorSelection.range(anchor, head) };
    }
    if (action === "link") {
      if (range.empty) {
        // Cursor lands between the brackets, ready to type the link text.
        return {
          changes: { from: range.from, insert: "[](url)" },
          range: EditorSelection.cursor(range.from + 1)
        };
      }
      const text = state.doc.sliceString(range.from, range.to);
      // `url` is selected so typing a target replaces it.
      const urlStart = range.from + text.length + 3;
      return {
        changes: { from: range.from, to: range.to, insert: `[${text}](url)` },
        range: EditorSelection.range(urlStart, urlStart + 3)
      };
    }
    if (marker !== undefined) {
      const { specs, anchor, head } = inlineSpec(state, range, marker);
      return { changes: specs, range: EditorSelection.range(anchor, head) };
    }
    const { specs, anchor, head } = lineSpec(
      state,
      range,
      action as "bullet-list" | "numbered-list" | "task-list" | "quote"
    );
    return { changes: specs, range: EditorSelection.range(anchor, head) };
  });
  return { ...result, userEvent: "input.format", scrollIntoView: true };
}
