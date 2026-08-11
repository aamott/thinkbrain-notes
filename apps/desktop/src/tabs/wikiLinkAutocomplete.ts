import { autocompletion, startCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { NoteIndexEntry } from "@thinkbrain/core";

/**
 * Maximum number of completions returned in one popup.
 *
 * CodeMirror renders every option it receives, so capping keeps large vaults
 * responsive. The list is sorted by relevance (filename > title > alias) then
 * alphabetically, so the most likely targets stay on top.
 */
const MAX_RESULTS = 50;

/**
 * Strips a trailing `.md`/`.markdown` extension from a file name, returning the
 * bare target used inside `[[...]]`. Falls back to the input unchanged when
 * there is no recognized extension.
 */
function baseName(fileName: string): string {
  return fileName.replace(/\.(md|markdown)$/i, "");
}

/**
 * Readable label for a note in the popup: the frontmatter `title` when present,
 * otherwise the file name without extension.
 */
function labelFor(note: NoteIndexEntry): string {
  return note.title?.trim() ? note.title.trim() : baseName(note.fileName);
}

interface RankedCompletion extends Completion {
  /** Lower is better; used to sort before slicing to {@link MAX_RESULTS}. */
  rank: number;
}

/**
 * Builds the filtered, ranked completion list for a given query.
 *
 * Matching is case-insensitive and substring-based across the note's file name,
 * title, and aliases. The rank encodes where the first match was found so that
 * filename hits sort above title hits, which sort above alias hits.
 */
function buildCompletions(query: string, notes: readonly NoteIndexEntry[]): Completion[] {
  const needle = query.trim().toLowerCase();
  const ranked: RankedCompletion[] = [];

  for (const note of notes) {
    // `target` is the bare filename used both for matching (lowercased below)
    // and for the `[[Target]]` apply string (original case preserved here).
    const target = baseName(note.fileName);
    const file = target.toLowerCase();
    const title = note.title?.toLowerCase() ?? "";
    const aliases = note.aliases.map((a) => a.toLowerCase());

    let rank: number;
    if (needle === "") {
      // Empty query: surface everything, filename bucket first.
      rank = 0;
    } else if (file.includes(needle)) {
      rank = 0;
    } else if (title && title.includes(needle)) {
      rank = 1;
    } else if (aliases.some((a) => a.includes(needle))) {
      rank = 2;
    } else {
      continue;
    }

    ranked.push({
      label: labelFor(note),
      detail: note.relativePath,
      type: "reference",
      // `apply` includes the brackets because the result's `from` points at the
      // first `[` (see `wikiLinkCompletionSource`), so the replacement range is
      // the whole `[[partial`. Keep `apply` and that `from`/`to` in sync: if the
      // range ever shrinks to just the partial text after `[[`, drop the brackets
      // here too or they will be doubled.
      apply: `[[${target}]]`,
      rank
    });
  }

  // Stable sort: rank first, then label alphabetically. The `rank` field is
  // stripped before returning so it never leaks into the CodeMirror payload.
  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.label.localeCompare(b.label);
  });

  return ranked.slice(0, MAX_RESULTS).map(({ rank: _omit, ...completion }) => {
    void _omit;
    return completion;
  });
}

/**
 * CodeMirror autocomplete source for `[[Target]]` wiki links.
 *
 * Triggers while the cursor sits inside an unclosed `[[...` opener. The regex
 * `/\[\[[^\]|]*$/` matches from the opening brackets to the cursor, stopping at
 * a pipe (alias separator) or closing brackets so completions only appear while
 * typing the target itself.
 */
function wikiLinkCompletionSource(notes: readonly NoteIndexEntry[]) {
  return (context: CompletionContext): CompletionResult | null => {
    // `matchBefore` returns the text from the start of the match up to the
    // cursor. A null result means we are not inside a wiki-link opener.
    const before = context.matchBefore(/\[\[[^\]|]*$/);
    if (!before) return null;

    // The query is whatever follows `[[`; empty when the brackets were just
    // typed. `before.text` always starts with `[[` because of the regex.
    const query = before.text.slice(2);
    const completions = buildCompletions(query, notes);
    if (completions.length === 0) return null;

    // `from`/`to` span the full `[[partial` (brackets included), which is why
    // each completion's `apply` string also includes the `[[...]]` brackets.
    // `filter: false` disables CodeMirror's built-in fuzzy matcher, which would
    // otherwise use the `[[`-prefixed range text as a pattern and discard every
    // option (no label contains `[[`). We do our own filtering in
    // `buildCompletions` using the text *after* `[[`.
    return {
      from: before.from,
      to: context.pos,
      options: completions,
      filter: false
    };
  };
}

/**
 * Builds the wiki-link autocomplete extension for a given note index.
 *
 * The extension is cheap to reconfigure: `autocompletion` keeps its own UI
 * state, and the source closes over the supplied `noteIndex` so a fresh
 * extension instance is all that is needed when the vault index changes.
 *
 * Args:
 *   noteIndex: The vault's parsed notes. An empty array disables the popup
 *     (the source returns null for every context).
 *
 * Returns:
 *   A CodeMirror `Extension` to add to the editor configuration.
 */
export function wikiLinkAutocomplete(noteIndex: readonly NoteIndexEntry[]): Extension {
  if (noteIndex.length === 0) return [];
  return [
    autocompletion({
      override: [wikiLinkCompletionSource(noteIndex)],
      // Wiki links are usually short; don't require a keystroke before showing.
      activateOnTyping: true
    }),
    // `activateOnTyping` only fires for word characters, but `[` is not one,
    // so typing `[[` does not automatically trigger the popup. This ViewPlugin
    // watches for the `[[` sequence appearing at the cursor after a doc change
    // and explicitly starts completion so the dropdown appears immediately.
    ViewPlugin.fromClass(
      class {
        update(update: ViewUpdate) {
          if (!update.docChanged) return;
          const pos = update.state.selection.main.head;
          if (pos < 2) return;
          const before = update.state.sliceDoc(pos - 2, pos);
          if (before === "[[") startCompletion(update.view);
        }
      }
    )
  ];
}

/**
 * Exposes the raw completion source for unit testing.
 *
 * The source is a pure function of a `CompletionContext`; testing it directly
 * avoids the overhead of mounting a full `autocompletion` extension and lets
 * tests assert on filtering and `apply` behavior deterministically.
 */
export function wikiLinkCompletionSourceForTest(
  noteIndex: readonly NoteIndexEntry[]
): (context: CompletionContext) => CompletionResult | null {
  return wikiLinkCompletionSource(noteIndex);
}
