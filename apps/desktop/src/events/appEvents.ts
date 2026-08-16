/**
 * App-wide events the desktop shell and adapters emit and extensions consume.
 *
 * The map below is the beta event contract: every entry names a moment that
 * has already happened, with a payload of plain workspace-relative facts.
 * Extensions subscribe through `context.events`, which scopes each
 * subscription to the activation so deactivation removes it.
 */

import { createEventBus, type EventBus } from "@thinkbrain/core";

/**
 * Who made a change: this app, or something else touching the same folder.
 *
 * Only consumers that would act destructively on the answer need to read it —
 * an open editor must not re-read a file over the keystrokes that produced the
 * save it is hearing about. Everything else treats both alike. Leaving it out
 * means `"local"`, so an emitter that forgets it costs freshness, not work.
 */
export type NoteChangeOrigin = "local" | "external";

export interface AppEvents {
  /** A note was opened in an editor tab. */
  readonly "note.opened": { readonly rootPath: string; readonly relativePath: string };
  /** A note's contents were written to disk. */
  readonly "note.saved": { readonly rootPath: string; readonly relativePath: string; readonly origin?: NoteChangeOrigin };
  /** A new note was created on disk. */
  readonly "note.created": { readonly rootPath: string; readonly relativePath: string; readonly origin?: NoteChangeOrigin };
  /** A note was renamed or moved. */
  readonly "note.renamed": { readonly rootPath: string; readonly oldRelativePath: string; readonly newRelativePath: string; readonly origin?: NoteChangeOrigin };
  /** A note was deleted. */
  readonly "note.deleted": { readonly rootPath: string; readonly relativePath: string; readonly origin?: NoteChangeOrigin };
  /** A workspace was opened in this window. */
  readonly "workspace.opened": { readonly rootPath: string };
}

/** The app-wide bus. The shell and adapters emit; extensions subscribe. */
export const appEvents: EventBus<AppEvents> = createEventBus<AppEvents>();
