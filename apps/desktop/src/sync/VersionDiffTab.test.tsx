// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VersionDiff } from "./historyTypes";

const readVersionDiff = vi.fn<
  (rootPath: string, notePath: string, change: string, buffer?: string | null) => Promise<VersionDiff>
>();

vi.mock("./syncService", () => ({
  readVersionDiff
}));

// The side-by-side surface is CodeMirror's, not this screen's behavior: what
// the tests owe is that it is mounted with the right texts, read-only, and
// that Restore reaches the shell's safe-restore callback. A stub stands in.
const lastDiff = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));

vi.mock("./CodeMirrorDiff", () => ({
  CodeMirrorDiff: (props: Record<string, unknown>) => {
    lastDiff.props = props;
    return (
      <section aria-label={props.ariaLabel as string} data-testid="codemirror-diff">
        <p>{props.beforeLabel as string}</p>
        <p>{props.afterLabel as string}</p>
        <pre data-testid="before">{props.before as string}</pre>
        <pre data-testid="after">{props.after as string}</pre>
      </section>
    );
  }
}));

const { VersionDiffTab } = await import("./VersionDiffTab");

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const DIFF: VersionDiff = {
  kind: "text",
  change: "chg-42",
  notePath: "Meeting Notes.md",
  chunks: [
    { kind: "common", text: "# Q3 sync\nattendees\n" },
    { kind: "choice", ours: "follow up with design\n", theirs: "sync directly with design\n" },
    { kind: "common", text: "next check-in Aug 18\n" }
  ]
};

const OURS_TEXT = "# Q3 sync\nattendees\nfollow up with design\nnext check-in Aug 18\n";
const THEIRS_TEXT = "# Q3 sync\nattendees\nsync directly with design\nnext check-in Aug 18\n";

beforeEach(() => {
  lastDiff.props = null;
  readVersionDiff.mockReset().mockResolvedValue(DIFF);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (overrides?: {
  rootPath?: string | null;
  notePath?: string | null;
  changeId?: string | null;
  currentBuffer?: string | null;
  onRestore?: (notePath: string, changeId: string) => Promise<void>;
}): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <VersionDiffTab
        rootPath={overrides && "rootPath" in overrides ? overrides.rootPath ?? null : "/notes"}
        notePath={overrides && "notePath" in overrides ? overrides.notePath ?? null : "Meeting Notes.md"}
        changeId={overrides && "changeId" in overrides ? overrides.changeId ?? null : "chg-42"}
        currentBuffer={overrides?.currentBuffer ?? null}
        onRestore={overrides?.onRestore ?? (async () => undefined)}
      />
    )
  );
  return container;
};

const button = (host: HTMLElement, text: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(text)
  );
  if (!found) throw new Error(`No button reading "${text}" among: ${host.textContent}`);
  return found;
};

describe("comparing a recorded version", () => {
  it("asks the native side for the comparison, including unsaved edits", async () => {
    await render({ currentBuffer: "# Q3 sync\nunsaved line\n" });

    expect(readVersionDiff).toHaveBeenCalledWith(
      "/notes",
      "Meeting Notes.md",
      "chg-42",
      "# Q3 sync\nunsaved line\n"
    );
    expect(readVersionDiff).toHaveBeenCalledTimes(1);
  });

  it("names the file and says the comparison is read-only", async () => {
    const host = await render();

    expect(host.textContent).toContain("Meeting Notes.md");
    expect(host.textContent).toContain("read-only");
  });

  it("hands the comparison both whole versions, recorded on the left", async () => {
    const host = await render();

    expect(host.querySelector('[data-testid="codemirror-diff"]')).not.toBeNull();
    expect(lastDiff.props?.before).toBe(THEIRS_TEXT);
    expect(lastDiff.props?.after).toBe(OURS_TEXT);
    expect(lastDiff.props?.beforeLabel).toBe("Earlier version");
    expect(lastDiff.props?.afterLabel).toBe("Current version");
    expect(lastDiff.props?.relativePath).toBe("Meeting Notes.md");
    expect(lastDiff.props?.editableAfter).toBe(false);
    expect(lastDiff.props?.transferBeforeToAfter).toBeUndefined();
  });
});

describe("restoring the recorded version", () => {
  it("restores through the shell callback and says what happened", async () => {
    const onRestore = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const host = await render({ onRestore });

    await act(async () => button(host, "Restore this version").click());

    expect(onRestore).toHaveBeenCalledWith("Meeting Notes.md", "chg-42");
    expect(host.textContent).toContain("Version restored");
    expect(host.textContent).toContain("Version history");
  });

  it("disables restore while the write is in flight", async () => {
    let settle: () => void = () => undefined;
    const onRestore = vi.fn<() => Promise<void>>().mockReturnValue(
      new Promise((resolve) => { settle = resolve; })
    );
    const host = await render({ onRestore });

    await act(async () => button(host, "Restore this version").click());

    expect(button(host, "Restore this version").disabled).toBe(true);

    await act(async () => settle());
  });

  it("shows a refusal rather than pretending the version went back", async () => {
    const onRestore = vi.fn<() => Promise<void>>().mockRejectedValue(
      new Error("That version changed since you opened it.")
    );
    const host = await render({ onRestore });

    await act(async () => button(host, "Restore this version").click());

    // A refused restore surfaces the refusal verbatim — never a success.
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "That version changed since you opened it."
    );
    expect(host.textContent).not.toContain("Version restored");
    // The comparison stays visible — nothing was overwritten.
    expect(host.querySelector('[data-testid="codemirror-diff"]')).not.toBeNull();
  });
});

describe("a file that cannot be compared piece by piece", () => {
  it("mounts no comparison but still offers restore", async () => {
    readVersionDiff.mockResolvedValue({ ...DIFF, kind: "binary", chunks: [] });
    const onRestore = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const host = await render({ onRestore });

    expect(host.textContent).toContain("can't be compared");
    expect(host.querySelector('[data-testid="codemirror-diff"]')).toBeNull();
    expect(lastDiff.props).toBeNull();

    await act(async () => button(host, "Restore this version").click());
    expect(onRestore).toHaveBeenCalledWith("Meeting Notes.md", "chg-42");
  });
});

describe("when the comparison cannot be read", () => {
  it("says so rather than showing an empty diff", async () => {
    // A non-native error is unexpected, so its raw message is not echoed —
    // `failureMessage` hides it behind the plain-language fallback.
    readVersionDiff.mockRejectedValue(new Error("disk gone"));

    const host = await render();

    expect(host.textContent).toContain("Could not open that version");
    expect(host.textContent).toContain("Something went wrong reading that version.");
    expect(host.querySelector('[data-testid="codemirror-diff"]')).toBeNull();
  });

  it("explains a tab that lost track of what it was about", async () => {
    const host = await render({ changeId: null });

    expect(host.textContent).toContain("Nothing to compare");
    expect(readVersionDiff).not.toHaveBeenCalled();
  });
});
