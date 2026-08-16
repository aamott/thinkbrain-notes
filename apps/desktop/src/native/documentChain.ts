import { NativeCommandError } from "./commands";

/**
 * Ordered, conflict-aware updates to a document more than one writer owns.
 *
 * Settings documents are shared: no writer owns the whole file, so each reads
 * it, merges its own keys and writes the result back. Two of those sequences
 * interleaved lose whichever landed first — that is how journal field
 * definitions disappeared on restart, and how a settings save reverted every
 * tab the window had opened since launch.
 *
 * Two things fix it, and both live here. Writers in this window queue behind
 * each other per key, so none of them revises a copy a completed write has
 * already superseded. Writers *outside* this window are caught by the host
 * instead: each write carries the document it was computed from, and the host
 * refuses it under a lock if that is no longer what is on disk. A refusal means
 * someone else's keys are in the file now, so the revision is recomputed
 * against them rather than written over them.
 *
 * Keyed because a workspace document is per workspace; a document with only one
 * instance just passes a constant.
 */

export interface DocumentChainOptions {
  /** The host's error code for a write whose `expected` no longer matches. */
  readonly conflictCode: string;
  read(key: string): Promise<string | null>;
  write(key: string, contents: string, expected: string | null): Promise<void>;
}

export interface DocumentChain {
  read(key: string): Promise<string | null>;
  /**
   * Revises the document and returns what was written.
   *
   * `revise` receives the document as it is on disk at the moment it runs — not
   * as it was when the caller decided to write — and returns the whole document
   * to store.
   */
  update(key: string, revise: (current: string | null) => string): Promise<string>;
}

/** Enough to outlast a burst from another writer, few enough to fail visibly. */
const MAX_ATTEMPTS = 4;

export function createDocumentChain(options: DocumentChainOptions): DocumentChain {
  /** The tail of each key's chain, so the next update can queue behind it. */
  const tails = new Map<string, Promise<unknown>>();

  const runUpdate = async (
    key: string,
    revise: (current: string | null) => string
  ): Promise<string> => {
    for (let attempt = 1; ; attempt += 1) {
      const current = await options.read(key);
      const contents = revise(current);
      try {
        await options.write(key, contents, current);
        return contents;
      } catch (error: unknown) {
        const conflicted =
          error instanceof NativeCommandError && error.code === options.conflictCode;
        if (!conflicted || attempt >= MAX_ATTEMPTS) throw error;
      }
    }
  };

  return {
    read: (key) => options.read(key),

    update: (key, revise) => {
      // A failed update must not strand the writers behind it, so the chain is
      // continued from a settled promise while the caller still sees the
      // rejection.
      const previous = tails.get(key) ?? Promise.resolve();
      const next = previous.then(
        () => runUpdate(key, revise),
        () => runUpdate(key, revise)
      );

      tails.set(key, next);
      void next
        .catch(() => undefined)
        .finally(() => {
          // Only the tail is worth remembering; anything else is a chain nobody
          // can still be waiting on.
          if (tails.get(key) === next) tails.delete(key);
        });

      return next;
    }
  };
}
