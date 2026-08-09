import {
  buildNewEntryFrontmatter,
  compareJournalEntries,
  formatJournalDate,
  parseJournalFilename,
  resolveNewEntryPath,
  UNDATED,
  type JournalDate,
  type JournalEntryRef
} from "@thinkbrain/core";

import type { DesktopExtensionWorkspace, ExtensionNote } from "../extensions/extensionWorkspace";

/**
 * The journal service: dates in, note paths out.
 *
 * UI-independent and clock-injected. Everything it touches goes through the
 * extension workspace API (D68), so the journal uses the same surface a
 * third-party extension would rather than a private back door.
 *
 * It creates and lists. It never rewrites a note it did not create (D20, D33).
 */

/** A journal entry located on disk. */
export interface JournalEntry {
  readonly relativePath: string;
  readonly ref: JournalEntryRef;
}

/** A file in the journal folder whose name carries no unambiguous date (D36, D38). */
export interface UndatedEntry {
  readonly relativePath: string;
  readonly updatedAt: number | null;
}

export interface JournalListing {
  /** Dated entries, chronological; date-only entries precede timed ones. */
  readonly entries: readonly JournalEntry[];
  /** Undated files, most recently modified first. */
  readonly undated: readonly UndatedEntry[];
}

export interface JournalService {
  /**
   * Creates a new entry, opens it, and returns its path.
   *
   * Always a new file, never an append (D18). The filename carries the current
   * clock time even when `date` is in the past (D61). It opens because the
   * point of creating an entry is to write in it (D1).
   */
  createEntry(date?: JournalDate): Promise<string>;
  listEntries(): Promise<JournalListing>;
  /** Opens an entry the popout listed, as an ordinary editor tab (D9). */
  openEntry(relativePath: string): Promise<void>;
  /** First line of an entry's prose, or `null` when it has none. */
  readPreview(relativePath: string): Promise<string | null>;
  /** Opens today's most recent entry, creating one when today has none. */
  openToday(): Promise<string>;
}

export interface JournalServiceOptions {
  readonly workspace: DesktopExtensionWorkspace;
  /** The configured journal root (D7). */
  readonly root: () => string;
  /** Injected so backfill and collisions are deterministic in tests. */
  readonly now: () => Date;
}

/** Approved failure copy (D63): name what failed, offer the fix. */
const NO_WORKSPACE = "Open a folder to start journaling.";
const INVALID_ROOT = "The journal folder setting isn't a valid path.";
const UNREADABLE_FOLDER = "Can't read the journal folder.";

/** Which failure happened, so the UI picks a state without matching on copy. */
export type JournalErrorCode = "no-workspace" | "invalid-root" | "unreadable";

/** An error carrying user-facing copy plus the detail behind it. */
export class JournalError extends Error {
  constructor(
    readonly code: JournalErrorCode,
    message: string,
    readonly detail: string | undefined,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "JournalError";
  }
}

function toJournalDate(when: Date): JournalDate {
  return { year: when.getFullYear(), month: when.getMonth() + 1, day: when.getDate() };
}

function minuteOfDay(when: Date): number {
  return when.getHours() * 60 + when.getMinutes();
}

export function createJournalService(options: JournalServiceOptions): JournalService {
  const { workspace, root, now } = options;

  /** Fails with the approved copy rather than a raw path or native error. */
  const requireRoot = (): string => {
    if (workspace.rootPath() === null) throw new JournalError("no-workspace", NO_WORKSPACE, undefined);
    const configured = root();
    if (
      typeof configured !== "string" ||
      configured.trim() === "" ||
      configured.split(/[\\/]/).includes("..")
    ) {
      throw new JournalError("invalid-root", INVALID_ROOT, String(configured));
    }
    return configured;
  };

  const listFolder = async (folder: string): Promise<readonly ExtensionNote[]> => {
    try {
      return await workspace.listNotes(folder);
    } catch (cause: unknown) {
      throw new JournalError("unreadable", UNREADABLE_FOLDER, folder, { cause });
    }
  };

  const listEntries = async (): Promise<JournalListing> => {
    const folder = requireRoot();
    const notes = await listFolder(folder);

    const entries: JournalEntry[] = [];
    const undated: UndatedEntry[] = [];
    for (const note of notes) {
      const ref = parseJournalFilename(note.relativePath);
      if (ref === UNDATED) {
        undated.push({ relativePath: note.relativePath, updatedAt: note.updatedAt });
        continue;
      }
      entries.push({ relativePath: note.relativePath, ref });
    }

    entries.sort((left, right) => compareJournalEntries(left.ref, right.ref));
    undated.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
    return { entries, undated };
  };

  /**
   * Paths this session has written, which a listing may not report yet.
   *
   * `listNotes` is a directory scan and `createNote` is a separate native call;
   * on the synced folders this app targets — OneDrive, Syncthing — the scan can
   * lag the write. Remembering what we wrote is the only thing available that
   * does not depend on the filesystem agreeing with itself.
   */
  const writtenPaths = new Set<string>();
  const writtenByDay = new Map<string, string>();

  /**
   * Runs entry creation one at a time.
   *
   * Two "Today" clicks in quick succession would otherwise both list, both find
   * nothing, and both write.
   */
  let tail: Promise<unknown> = Promise.resolve();
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work);
    tail = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  const createEntry = (date?: JournalDate): Promise<string> => serialize(() => create(date));

  const create = async (date?: JournalDate): Promise<string> => {
    const folder = requireRoot();
    const when = now();
    const entryDate = date ?? toJournalDate(when);
    const notes = await listFolder(folder);

    const relativePath = resolveNewEntryPath({
      root: folder,
      date: entryDate,
      // The clock, not the supplied date: backfilling picks the day, not the
      // minute the user happened to write it (D61).
      minuteOfDay: minuteOfDay(when),
      // Includes what this session has written but the listing may not show
      // yet, or two entries a minute apart would collide on the same name.
      taken: [...notes.map((note) => note.relativePath), ...writtenPaths]
    });

    const frontmatter = buildNewEntryFrontmatter(entryDate);
    // Parent folders are created for us, so a backfilled year/month appears
    // without a prompt (D62).
    await workspace.createNote(
      relativePath,
      `---\ndate: ${frontmatter.date}\n---\n\n`
    );
    writtenPaths.add(relativePath);
    writtenByDay.set(formatJournalDate(entryDate), relativePath);
    await workspace.openNote(relativePath);
    return relativePath;
  };

  const openToday = (): Promise<string> => serialize(async () => {
    const today = formatJournalDate(toJournalDate(now()));
    const { entries } = await listEntries();
    const todays = entries.filter(
      (entry) => formatJournalDate(entry.ref.date) === today
    );

    // The listing first, then what this session wrote: a directory scan can lag
    // a write it has already accepted, and answering that with a second entry
    // for the same day is the one outcome worse than being slow.
    const existing = todays.at(-1)?.relativePath ?? writtenByDay.get(today);
    // `create` opens what it makes, so opening again here would put the same
    // note through the tab machinery twice.
    if (existing === undefined) return create();
    await workspace.openNote(existing);
    return existing;
  });

  const openEntry = async (relativePath: string): Promise<void> => {
    await workspace.openNote(relativePath);
  };

  /**
   * The entry's first line of prose, for the list.
   *
   * Read on demand, never cached here: the popout asks only for rows it is
   * about to show, and a stale preview would outlive the file it came from.
   */
  const readPreview = async (relativePath: string): Promise<string | null> => {
    try {
      const contents = await workspace.readNote(relativePath);
      const body = contents.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
      const line = body
        .split(/\r?\n/)
        .map((candidate) => candidate.trim())
        .find((candidate) => candidate.length > 0);
      return line ?? null;
    } catch {
      // A preview is a nicety; failing to read one must not empty the list.
      return null;
    }
  };

  return { createEntry, listEntries, openEntry, openToday, readPreview };
}
