// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JournalFieldDefinitionsControl } from "./JournalFieldDefinitionsControl";
import type { ControlProps } from "../settings/controlRegistry";

/**
 * D82: the field editor.
 *
 * The storage shape is D49's and does not move — every test that writes checks
 * the JSON that comes out. What changes is that nobody has to type it.
 */

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const DEFINITION = {
  key: "extension-journal-calendar.fieldDefinitions",
  type: "string" as const,
  label: "Metadata fields",
  description: "Things you record about a day.",
  default: "[]",
  scope: "workspace" as const,
  section: "journal"
};

const MOOD = {
  id: "mood",
  label: "Mood",
  type: "single-select",
  options: ["rough", "okay", "good"]
};

const render = async (
  value: unknown = "[]",
  onChange: (next: unknown) => void = () => undefined
): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const props: ControlProps = {
    definition: DEFINITION,
    value,
    onChange,
    disabled: false
  };
  await act(async () => root?.render(<JournalFieldDefinitionsControl {...props} />));
  return container;
};

const click = async (host: HTMLElement, name: string): Promise<void> => {
  const found = [...host.querySelectorAll("button")].find(
    (candidate) => candidate.getAttribute("aria-label") === name || candidate.textContent === name
  );
  if (!found) throw new Error(`No control named "${name}"`);
  await act(async () => found.click());
};

const type = async (host: HTMLElement, label: string, text: string): Promise<void> => {
  const input = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
  if (!input) throw new Error(`No input labelled "${label}"`);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const written = (onChange: ReturnType<typeof vi.fn>): unknown =>
  JSON.parse(String(onChange.mock.calls.at(-1)?.[0] ?? "null"));

describe("the list", () => {
  it("invites a first field rather than showing an empty box", async () => {
    const host = await render("[]");

    expect(host.textContent).toContain("Nothing yet");
    expect(host.querySelector('button[aria-label="Add a field"]')).not.toBeNull();
  });

  it("describes each field in words, never in type names", async () => {
    const host = await render(JSON.stringify([MOOD]));

    expect(host.textContent).toContain("Mood");
    expect(host.textContent).toContain("Pick one");
    expect(host.textContent).toContain("rough");
    expect(host.textContent).not.toContain("single-select");
  });
});

describe("adding a field (D82)", () => {
  it("writes D49's shape from a name, a kind and some choices", async () => {
    const onChange = vi.fn();
    const host = await render("[]", onChange);

    await click(host, "Add a field");
    await type(host, "Field name", "Mood");
    await click(host, "Pick one from a list");
    await type(host, "New choice", "rough");
    await click(host, "Add choice");
    await type(host, "New choice", "good");
    await click(host, "Add choice");
    await click(host, "Add field");

    expect(written(onChange)).toEqual([
      { id: "mood", label: "Mood", type: "single-select", options: ["rough", "good"] }
    ]);
  });

  it("derives the key from the name and shows it", async () => {
    const host = await render("[]");

    await click(host, "Add a field");
    await type(host, "Field name", "How I felt");

    expect(host.textContent).toContain("how-i-felt");
  });

  it("writes no options for a field that takes none", async () => {
    const onChange = vi.fn();
    const host = await render("[]", onChange);

    await click(host, "Add a field");
    await type(host, "Field name", "Energy");
    await click(host, "A number");
    await click(host, "Add field");

    expect(written(onChange)).toEqual([{ id: "energy", label: "Energy", type: "number" }]);
  });

  it("adds to what is already there rather than replacing it", async () => {
    const onChange = vi.fn();
    const host = await render(JSON.stringify([MOOD]), onChange);

    await click(host, "Add a field");
    await type(host, "Field name", "Energy");
    await click(host, "A number");
    await click(host, "Add field");

    expect(written(onChange)).toHaveLength(2);
  });
});

describe("refusing what cannot work (D48/D49)", () => {
  const startNamed = async (host: HTMLElement, name: string): Promise<void> => {
    await click(host, "Add a field");
    await type(host, "Field name", name);
  };

  it("refuses a reserved key and says which word is taken", async () => {
    const host = await render("[]");

    await startNamed(host, "Tags");

    expect(host.textContent).toContain("already used by the app");
    expect(
      host.querySelector<HTMLButtonElement>('button[aria-label="Add field"]')?.disabled
    ).toBe(true);
  });

  it("refuses a key that already exists", async () => {
    const host = await render(JSON.stringify([MOOD]));

    await startNamed(host, "Mood");

    expect(host.textContent).toContain("already have");
    expect(
      host.querySelector<HTMLButtonElement>('button[aria-label="Add field"]')?.disabled
    ).toBe(true);
  });

  it("refuses a name with no letters or numbers in it", async () => {
    const host = await render("[]");

    await startNamed(host, "!!!");

    expect(host.textContent).toContain("letters or numbers");
  });

  it("will not add a list field with no choices", async () => {
    const host = await render("[]");

    await startNamed(host, "Weather");
    await click(host, "Pick one from a list");

    expect(
      host.querySelector<HTMLButtonElement>('button[aria-label="Add field"]')?.disabled
    ).toBe(true);
    expect(host.textContent).toContain("at least one choice");
  });
});

describe("editing and removing", () => {
  it("renames without touching the key, because that is the safe half", async () => {
    const onChange = vi.fn();
    const host = await render(JSON.stringify([MOOD]), onChange);

    await click(host, "Edit Mood");
    await type(host, "Field name", "How I felt");
    await click(host, "Save field");

    expect(written(onChange)).toEqual([{ ...MOOD, label: "How I felt" }]);
  });

  it("warns before re-keying, because notes are linked by the key", async () => {
    const host = await render(JSON.stringify([MOOD]));

    await click(host, "Edit Mood");
    await click(host, "Change");
    await type(host, "Key in your notes", "feeling");

    expect(host.textContent).toContain("stop being linked");
  });

  it("says what removing does to notes before it does it", async () => {
    const onChange = vi.fn();
    const host = await render(JSON.stringify([MOOD]), onChange);

    await click(host, "Remove Mood");

    expect(host.textContent).toContain("stays in your notes");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes only on confirmation", async () => {
    const onChange = vi.fn();
    const host = await render(JSON.stringify([MOOD]), onChange);

    await click(host, "Remove Mood");
    await click(host, "Remove");

    expect(written(onChange)).toEqual([]);
  });
});

describe("ordering", () => {
  const ENERGY = { id: "energy", label: "Energy", type: "number" };

  // The list order is the order the fields appear on an entry, so the list is
  // also how you arrange them.
  it("moves a field down", async () => {
    const onChange = vi.fn();
    const host = await render(JSON.stringify([MOOD, ENERGY]), onChange);

    await click(host, "Move Mood down");

    expect((written(onChange) as { id: string }[]).map((field) => field.id)).toEqual([
      "energy",
      "mood"
    ]);
  });

  it("moves a field up", async () => {
    const onChange = vi.fn();
    const host = await render(JSON.stringify([MOOD, ENERGY]), onChange);

    await click(host, "Move Energy up");

    expect((written(onChange) as { id: string }[]).map((field) => field.id)).toEqual([
      "energy",
      "mood"
    ]);
  });

  it("offers no way off either end of the list", async () => {
    const host = await render(JSON.stringify([MOOD, ENERGY]));

    expect(host.querySelector('button[aria-label="Move Mood up"]')).toBeNull();
    expect(host.querySelector('button[aria-label="Move Energy down"]')).toBeNull();
  });
});

describe("the JSON escape hatch", () => {
  it("still edits the same setting", async () => {
    const onChange = vi.fn();
    const host = await render("[]", onChange);

    await click(host, "Edit as JSON");
    const box = host.querySelector<HTMLTextAreaElement>("textarea");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(box, JSON.stringify([MOOD]));
      box?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(written(onChange)).toEqual([MOOD]);
  });

  it("refuses to save what does not parse", async () => {
    const onChange = vi.fn();
    const host = await render("[]", onChange);

    await click(host, "Edit as JSON");
    const box = host.querySelector<HTMLTextAreaElement>("textarea");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(box, "[{oh no");
      box?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });

  // A setting edited by hand, or by an older build, must not cost anyone their
  // fields just because this control cannot draw it.
  it("falls back to JSON when the stored value is unreadable", async () => {
    const host = await render("[{oh no");

    expect(host.querySelector("textarea")).not.toBeNull();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });
});
