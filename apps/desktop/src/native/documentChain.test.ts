import { describe, expect, it, vi } from "vitest";

import { createDocumentChain } from "./documentChain";
import { NativeCommandError } from "./commands";

const CONFLICT = "settings.test_conflict";

const parse = (raw: string | null): Record<string, unknown> =>
  raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>);

const patch = (key: string, value: unknown) => (raw: string | null) =>
  JSON.stringify({ ...parse(raw), [key]: value });

/**
 * A typed stand-in for the host's document: `read` returns what `write`
 * stored, and `write` can be re-programmed per test (conflicts, holds).
 */
function createDisk() {
  const contents = new Map<string, string | null>();
  const reads = vi.fn(async (key: string) => contents.get(key) ?? null);
  const writes = vi.fn(async (key: string, next: string) => {
    contents.set(key, next);
  });
  return { contents, reads, writes };
}

function chainOf(disk: ReturnType<typeof createDisk>) {
  return createDocumentChain({
    conflictCode: CONFLICT,
    read: disk.reads,
    write: disk.writes
  });
}

describe("createDocumentChain", () => {
  it("reads through to the document", async () => {
    const disk = createDisk();
    disk.contents.set("k", "raw-doc");

    await expect(chainOf(disk).read("k")).resolves.toBe("raw-doc");
    expect(disk.reads).toHaveBeenCalledWith("k");
  });

  /**
   * Two writers on the same key each read, merge, and write. Serialized by the
   * chain, the second writer revises the first's result instead of clobbering
   * it — the lost-update bug this module exists to prevent.
   */
  it("serializes same-key writes so both fields survive and the final doc returns", async () => {
    const disk = createDisk();
    const chain = chainOf(disk);

    const written = await Promise.all([
      chain.update("k", patch("a", 1)),
      chain.update("k", patch("b", 2))
    ]);

    expect(parse(disk.contents.get("k") ?? null)).toEqual({ a: 1, b: 2 });
    // Each caller gets back the document it wrote.
    expect(written.map(parse)).toEqual([{ a: 1 }, { a: 1, b: 2 }]);
  });

  /** One writer's failure must not strand every writer queued behind it. */
  it("rejects the failed caller but still runs the queued next writer", async () => {
    const disk = createDisk();
    const chain = chainOf(disk);

    const failed = chain.update("k", () => {
      throw new Error("nope");
    });
    const after = chain.update("k", patch("ok", true));

    await expect(failed).rejects.toThrow("nope");
    await expect(after).resolves.toContain("ok");
    expect(parse(disk.contents.get("k") ?? null)).toEqual({ ok: true });
  });

  it("rejects a failing write the same way and still runs the next writer", async () => {
    const disk = createDisk();
    let failOnce = true;
    disk.writes.mockImplementation(async (key, next) => {
      if (failOnce) {
        failOnce = false;
        throw new Error("write blew up");
      }
      disk.contents.set(key, next);
    });
    const chain = chainOf(disk);

    const failed = chain.update("k", patch("a", 1));
    const after = chain.update("k", patch("b", 2));

    await expect(failed).rejects.toThrow("write blew up");
    await expect(after).resolves.toContain("b");
    expect(parse(disk.contents.get("k") ?? null)).toEqual({ b: 2 });
  });

  it("rejects a failing read the same way and still runs the next writer", async () => {
    const disk = createDisk();
    let failOnce = true;
    disk.reads.mockImplementation(async (key) => {
      if (failOnce) {
        failOnce = false;
        throw new Error("read blew up");
      }
      return disk.contents.get(key) ?? null;
    });
    const chain = chainOf(disk);

    const failed = chain.update("k", patch("a", 1));
    const after = chain.update("k", patch("b", 2));

    await expect(failed).rejects.toThrow("read blew up");
    await expect(after).resolves.toContain("b");
  });

  /**
   * Another writer can land between this chain's read and its write. The host
   * refuses the stale write under the configured conflict code, so the
   * revision is recomputed against what is actually on disk now.
   */
  it("recomputes the revision against the changed disk after a conflict", async () => {
    const disk = createDisk();
    disk.contents.set("k", JSON.stringify({ other: 1 }));
    let interfered = false;
    disk.writes.mockImplementation(async (key, next) => {
      if (!interfered) {
        interfered = true;
        // The other writer's write lands, so this attempt's `expected` is stale.
        disk.contents.set(key, JSON.stringify({ other: 2 }));
        throw new NativeCommandError({ code: CONFLICT, message: "conflict" });
      }
      disk.contents.set(key, next);
    });
    const chain = chainOf(disk);

    await chain.update("k", patch("mine", true));

    expect(parse(disk.contents.get("k") ?? null)).toEqual({ other: 2, mine: true });
    expect(disk.writes).toHaveBeenCalledTimes(2);
  });

  it("sends exactly what it read as the write's precondition, including null", async () => {
    const disk = createDisk();
    const chain = chainOf(disk);

    await chain.update("k", patch("a", 1));
    expect(disk.writes).toHaveBeenLastCalledWith("k", JSON.stringify({ a: 1 }), null);

    await chain.update("k", patch("b", 2));
    expect(disk.writes).toHaveBeenLastCalledWith(
      "k",
      JSON.stringify({ a: 1, b: 2 }),
      JSON.stringify({ a: 1 })
    );
  });

  it("gives up after exactly four conflicted attempts", async () => {
    const disk = createDisk();
    disk.writes.mockRejectedValue(new NativeCommandError({ code: CONFLICT, message: "conflict" }));
    const chain = chainOf(disk);

    await expect(chain.update("k", patch("a", 1))).rejects.toThrow("conflict");
    expect(disk.writes).toHaveBeenCalledTimes(4);
  });

  it("does not retry a NativeCommandError with a different code", async () => {
    const disk = createDisk();
    disk.writes.mockRejectedValue(
      new NativeCommandError({ code: "settings.other_code", message: "different failure" })
    );
    const chain = chainOf(disk);

    await expect(chain.update("k", patch("a", 1))).rejects.toThrow("different failure");
    expect(disk.writes).toHaveBeenCalledTimes(1);
  });

  it("does not retry a plain Error", async () => {
    const disk = createDisk();
    disk.writes.mockRejectedValue(new Error("conflict-looking message"));
    const chain = chainOf(disk);

    await expect(chain.update("k", patch("a", 1))).rejects.toThrow("conflict-looking message");
    expect(disk.writes).toHaveBeenCalledTimes(1);
  });

  /**
   * Chains are keyed so unrelated documents never queue behind each other.
   * Holding one key's write open proves the second key's write completes
   * without it — a Promise.all pass alone could hide a shared tail.
   */
  it("lets another key's write complete while one key's write is held", async () => {
    const disk = createDisk();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    disk.writes.mockImplementation(async (key, next) => {
      if (key === "held-key") await held;
      disk.contents.set(key, next);
    });
    const chain = chainOf(disk);

    const heldUpdate = chain.update("held-key", patch("a", 1));
    // Give the held update a tick to enter its (blocked) write.
    await Promise.resolve();

    await expect(chain.update("free-key", patch("b", 2))).resolves.toContain("b");
    expect(disk.contents.get("free-key")).toBe(JSON.stringify({ b: 2 }));

    release();
    await expect(heldUpdate).resolves.toContain("a");
  });
});
