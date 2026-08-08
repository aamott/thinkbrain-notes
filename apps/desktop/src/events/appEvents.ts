/**
 * App-wide events the desktop shell and adapters emit and extensions consume.
 *
 * The map below is the beta event contract: every entry names a moment that
 * has already happened, with a payload of plain workspace-relative facts.
 * Extensions subscribe through `context.events`, which scopes each
 * subscription to the activation so deactivation removes it.
 */

import { createEventBus, type EventBus } from "@thinkbrain/core";

export interface AppEvents {
  /** A note was opened in an editor tab. */
  readonly "note.opened": { readonly rootPath: string; readonly relativePath: string };
  /** A note's contents were written to disk. */
  readonly "note.saved": { readonly rootPath: string; readonly relativePath: string };
  /** A new note was created on disk. */
  readonly "note.created": { readonly rootPath: string; readonly relativePath: string };
  /** A workspace was opened in this window. */
  readonly "workspace.opened": { readonly rootPath: string };
}

/** The app-wide bus. The shell and adapters emit; extensions subscribe. */
export const appEvents: EventBus<AppEvents> = createEventBus<AppEvents>();
