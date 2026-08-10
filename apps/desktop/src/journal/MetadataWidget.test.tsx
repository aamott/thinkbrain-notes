// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MetadataWidget, type MetadataWidgetProps } from "./MetadataWidget";
import { MetadataWidgetContainer } from "./MetadataWidgetContainer";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const definitions = [
  { id: "mood", label: "Mood", type: "single-select" as const, options: ["rough", "okay", "good"] },
  { id: "energy", label: "Energy", type: "number" as const },
  {
    id: "context",
    label: "Context",
    type: "multi-select" as const,
    options: ["baking", "reading", "running"]
  },
  { id: "note", label: "Note to self", type: "text" as const }
];

const render = async (overrides: Partial<MetadataWidgetProps> = {}): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const props: MetadataWidgetProps = {
    date: { year: 2026, month: 8, day: 7 },
    definitions,
    values: {},
    diagnostics: [],
    onSet: () => undefined,
    ...overrides
  };
  await act(async () => root?.render(<MetadataWidget {...props} />));
  return container;
};

const click = async (host: HTMLElement, name: string): Promise<void> => {
  const found = [...host.querySelectorAll("button")].find(
    (candidate) => candidate.getAttribute("aria-label") === name || candidate.textContent === name
  );
  if (!found) throw new Error(`No control named "${name}"`);
  await act(async () => found.click());
};

/**
 * Mounts a `MetadataWidgetContainer` with shared defaults. Each describe block
 * that needs a custom `note` factory passes it via `defaultContents`.
 */
const mountContainerHelper = async (
  defaultContents: string,
  props: Partial<React.ComponentProps<typeof MetadataWidgetContainer>> = {}
): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <MetadataWidgetContainer
        relativePath={props.relativePath ?? "journal/2026/08/2026-08-07-1802.md"}
        contents={props.contents ?? defaultContents}
        definitions={props.definitions ?? definitions}
        applyEdit={props.applyEdit}
        onDefineField={props.onDefineField}
        onAddOption={props.onAddOption}
      />
    )
  );
  return container;
};

describe("collapsed dateline", () => {
  it("shows the long date with its year (D74)", async () => {
    const host = await render();

    expect(host.textContent).toContain("Friday, August 7, 2026");
  });

  it("shows only the date and an invitation when nothing is recorded (D54)", async () => {
    const host = await render();

    expect(host.textContent).toContain("Info Tracker");
    // No placeholder values, no empty chips: the common case should look
    // finished rather than unfilled.
    expect(host.textContent).not.toMatch(/not set|—\s*—/);
  });

  it("summarises the recorded values in the order they are defined", async () => {
    const host = await render({
      values: { energy: 7, mood: "good", context: ["baking", "reading"] }
    });

    expect(host.textContent).toContain("good · 7 · baking, reading");
  });

  it("expands to the form and back", async () => {
    const host = await render({ values: { mood: "good" } });

    await click(host, "Info Tracker");
    expect(host.querySelectorAll("fieldset").length).toBeGreaterThan(0);

    await click(host, "Done");
    expect(host.querySelectorAll("fieldset")).toHaveLength(0);
  });
});

describe("editing", () => {
  it("records a single-select choice", async () => {
    const onSet = vi.fn();
    const host = await render({ onSet });
    await click(host, "Info Tracker");

    await click(host, "Mood: good");

    expect(onSet).toHaveBeenCalledWith("mood", "good");
  });

  it("clears a single-select choice when the same option is chosen again", async () => {
    const onSet = vi.fn();
    const host = await render({ values: { mood: "good" }, onSet });
    await click(host, "Info Tracker");

    await click(host, "Mood: good");

    expect(onSet).toHaveBeenCalledWith("mood", undefined);
  });

  it("adds and removes multi-select values without disturbing the others", async () => {
    const onSet = vi.fn();
    const host = await render({ values: { context: ["baking"] }, onSet });
    await click(host, "Info Tracker");

    await click(host, "Context: reading");
    expect(onSet).toHaveBeenCalledWith("context", ["baking", "reading"]);

    await click(host, "Context: baking");
    expect(onSet).toHaveBeenLastCalledWith("context", undefined);
  });

  it("records a number and a text value", async () => {
    const onSet = vi.fn();
    const host = await render({ onSet });
    await click(host, "Info Tracker");

    const [energy, note] = [...host.querySelectorAll("input")];
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(energy, "7");
      energy?.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(note, "Try 2% salt");
      note?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onSet).toHaveBeenCalledWith("energy", 7);
    expect(onSet).toHaveBeenCalledWith("note", "Try 2% salt");
  });

  it("clears a value rather than writing an empty string", async () => {
    const onSet = vi.fn();
    const host = await render({ values: { note: "Try 2% salt" }, onSet });
    await click(host, "Info Tracker");

    const note = [...host.querySelectorAll("input")].at(-1);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(note, "");
      note?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onSet).toHaveBeenLastCalledWith("note", undefined);
  });

  it("offers no controls when the user has configured no fields", async () => {
    const host = await render({ definitions: [] });

    expect(host.textContent).toContain("Friday, August 7, 2026");
    expect(host.querySelector("button")).toBeNull();
  });
});

describe("editing under a fingertip (M-2, D78)", () => {
  const withPointer = (coarse: boolean): void => {
    window.matchMedia = ((text: string) => ({
      matches: text === "(pointer: coarse)" ? coarse : false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    })) as unknown as typeof window.matchMedia;
  };

  afterEach(() => {
    withPointer(false);
  });

  it("opens the sheet instead of expanding the dateline in place", async () => {
    withPointer(true);
    const host = await render();

    await click(host, "Info Tracker");

    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe(
      "Friday, August 7"
    );
  });

  it("expands in place under a mouse, with no dialog at all", async () => {
    withPointer(false);
    const host = await render();

    await click(host, "Info Tracker");

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector("fieldset")).not.toBeNull();
  });

  // Two copies of the same field would mean two of every control in the
  // accessibility tree, one of them stranded behind the scrim.
  it("moves the fields into the sheet rather than duplicating them", async () => {
    withPointer(true);
    const host = await render();

    await click(host, "Info Tracker");

    const outside = [...host.querySelectorAll("fieldset")].filter(
      (field) => field.closest('[role="dialog"]') === null
    );
    expect(outside).toHaveLength(0);
  });

  it("returns to the dateline when the sheet is dismissed", async () => {
    withPointer(true);
    const host = await render();
    await click(host, "Info Tracker");

    const done = document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="Done"]');
    await act(async () => done?.click());

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain("Friday, August 7, 2026");
  });

  it("writes through the same path the dateline uses", async () => {
    withPointer(true);
    const onSet = vi.fn();
    const host = await render({ onSet });
    await click(host, "Info Tracker");

    const good = document.querySelector<HTMLButtonElement>('button[aria-label="Mood: good"]');
    await act(async () => good?.click());

    expect(onSet).toHaveBeenCalledWith("mood", "good");
  });
});

describe("adding a field from the entry (D86)", () => {
  const openAdd = async (host: HTMLElement, name: string): Promise<void> => {
    await click(host, "Add a field");
    const input = host.querySelector<HTMLInputElement>('input[aria-label="New field name"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, name);
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
  };

  it("offers the row only once the metadata is open", async () => {
    const host = await render();

    expect(host.querySelector('button[aria-label="Add a field"]')).toBeNull();
    await click(host, "Info Tracker");
    expect(host.querySelector('button[aria-label="Add a field"]')).not.toBeNull();
  });

  it("shows the new field, ready to fill in", async () => {
    const host = await render();
    await click(host, "Info Tracker");

    await openAdd(host, "Weather");

    expect(host.querySelector('input[aria-label="Weather"]')).not.toBeNull();
  });

  // Adding a field is not recording a value: an empty one must not put a key in
  // the file just because it was named.
  it("writes nothing until a value is typed", async () => {
    const onSet = vi.fn();
    const host = await render({ onSet });
    await click(host, "Info Tracker");

    await openAdd(host, "Weather");

    expect(onSet).not.toHaveBeenCalled();
  });

  it("writes the key once a value is typed", async () => {
    const onSet = vi.fn();
    const host = await render({ onSet });
    await click(host, "Info Tracker");
    await openAdd(host, "Weather");

    const input = host.querySelector<HTMLInputElement>('input[aria-label="Weather"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "drizzle");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onSet).toHaveBeenCalledWith("weather", "drizzle");
  });

  it("does not offer a field the entry already shows", async () => {
    const host = await render();
    await click(host, "Info Tracker");

    await click(host, "Add a field");

    // Every configured field is already on screen, so there is nothing of yours
    // left to offer — only naming a new one.
    expect(host.textContent).not.toContain("Your fields");
  });
});

describe("notices", () => {
  it("reports frontmatter it could not read, without blocking the note (D33)", async () => {
    const host = await render({
      diagnostics: [
        { code: "frontmatter_invalid", message: "Map keys must be unique", severity: "warning" }
      ]
    });

    const notice = host.querySelector('[role="status"]');
    expect(notice?.textContent).toContain("couldn't be read");
    // Still an entry, still showing its date.
    expect(host.textContent).toContain("Friday, August 7, 2026");
  });

  it("names both dates when the note disagrees with its filename (D74)", async () => {
    const host = await render({
      diagnostics: [
        {
          code: "journal_date_mismatch",
          message:
            "This note's date (2026-08-05) disagrees with its filename (2026-08-07); the filename is used.",
          severity: "warning"
        }
      ]
    });

    const notice = host.querySelector('[role="status"]');
    expect(notice?.textContent).toContain("2026-08-05");
    expect(notice?.textContent).toContain("filename");
  });

  it("never offers to repair the file", async () => {
    const host = await render({
      diagnostics: [
        { code: "journal_date_mismatch", message: "disagrees", severity: "warning" }
      ]
    });

    const labels = [...host.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(labels.join(" ")).not.toMatch(/fix|repair|update the note/i);
  });
});

describe("MetadataWidgetContainer", () => {
  const note = (frontmatter: string) =>
    `---\n${frontmatter}---\n\nBread needed more salt.\n`;

  const mountContainer = (props: Partial<React.ComponentProps<typeof MetadataWidgetContainer>> = {}) =>
    mountContainerHelper(note("date: 2026-08-07\n"), props);

  it("takes the date from the filename", async () => {
    const host = await mountContainer();

    expect(host.textContent).toContain("Friday, August 7, 2026");
  });

  // D83: the note was written when "elated" was a choice, or by another tool.
  // Either way the value survives a settings change and reads back intact.
  it("shows a value the settings no longer list, and keeps it on edit", async () => {
    const edits: string[] = [];
    const host = await mountContainer({
      contents: note("date: 2026-08-07\nmood: elated\n"),
      applyEdit: (next) => edits.push(next)
    });

    expect(host.textContent).toContain("elated");

    await click(host, "Info Tracker");
    expect(
      host
        .querySelector('button[aria-label="Mood: elated"]')
        ?.getAttribute("aria-pressed")
    ).toBe("true");

    // Choosing something else replaces it; nothing else in the note moves.
    await click(host, "Mood: good");
    expect(edits.at(-1)).toContain("mood: good");
  });

  it("reads the values already in the note", async () => {
    const host = await mountContainer({
      contents: note("date: 2026-08-07\nmood: good\nenergy: 7\n")
    });

    expect(host.textContent).toContain("good · 7");
  });

  it("reads all configured field values including multi-select in the summary", async () => {
    const host = await mountContainer({
      contents: note("date: 2026-08-07\nmood: good\nenergy: 7\ncontext: [baking, reading]\n")
    });

    expect(host.textContent).toContain("good · 7 · baking, reading");
  });

  it("reads unconfigured field values in the summary alongside configured ones", async () => {
    const host = await mountContainer({
      contents: note("date: 2026-08-07\nmood: good\nenergy: 7\nweather: sunny\n")
    });

    expect(host.textContent).toContain("good · 7 · sunny");
  });

  it("edits the open document instead of the file, changing one key", async () => {
    const applyEdit = vi.fn();
    const host = await mountContainer({
      contents: note("date: 2026-08-07\nenergy: 7\n"),
      applyEdit
    });

    // A value is already set, but the opener label stays "Info Tracker".
    await click(host, "Info Tracker");
    await click(host, "Mood: good");

    expect(applyEdit).toHaveBeenCalledWith(
      note("date: 2026-08-07\nenergy: 7\nmood: good\n")
    );
  });

  it("renders nothing for a note whose name carries no date", async () => {
    const host = await mountContainer({ relativePath: "journal/scratch.md" });

    expect(host.innerHTML).toBe("");
  });

  it("reports a date that disagrees with the filename", async () => {
    const host = await mountContainer({ contents: note("date: 2026-08-05\n") });

    expect(host.querySelector('[role="status"]')?.textContent).toContain("2026-08-05");
  });
});

describe("a key with no field behind it (D33)", () => {
  const note = (frontmatter: string) => `---\n${frontmatter}---\n\nBread needed more salt.\n`;

  const mount = (props: Partial<React.ComponentProps<typeof MetadataWidgetContainer>> = {}) =>
    mountContainerHelper(note("date: 2026-08-07\n"), props);
  /**
   * The reported bug: a note saying `mood: happy` with no configured fields
   * showed the date and nothing else. The value was in the file, preserved and
   * invisible — which reads as "the app lost it".
   */
  it("shows the value in the dateline anyway", async () => {
    const host = await mount({
      contents: note("date: 2026-08-07\nmood: happy\n"),
      definitions: []
    });

    expect(host.textContent).toContain("happy");
  });

  it("names the key, since there is no label to use", async () => {
    const host = await mount({
      contents: note("date: 2026-08-07\nmood: happy\n"),
      definitions: []
    });

    await click(host, "Info Tracker");

    expect(host.querySelector('input[aria-label="mood"]')).not.toBeNull();
  });

  it("stays editable, and edits the same key", async () => {
    const edits: string[] = [];
    const host = await mount({
      contents: note("date: 2026-08-07\nmood: happy\n"),
      definitions: [],
      applyEdit: (next) => edits.push(next)
    });

    await click(host, "Info Tracker");
    const input = host.querySelector<HTMLInputElement>('input[aria-label="mood"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "delighted");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(edits.at(-1)).toContain("mood: delighted");
  });

  it("offers to make it a real field, and hands back D49's shape", async () => {
    const defined: unknown[] = [];
    const host = await mount({
      contents: note("date: 2026-08-07\nmood: happy\n"),
      definitions: [],
      onDefineField: (definition) => defined.push(definition)
    });

    await click(host, "Info Tracker");
    await click(host, "Add mood to your fields");

    expect(defined).toEqual([{ id: "mood", label: "mood", type: "text" }]);
  });

  it("offers nothing to add when the field is already configured", async () => {
    const host = await mount({
      contents: note("date: 2026-08-07\nmood: good\n")
    });

    await click(host, "Info Tracker");

    expect(host.querySelector('button[aria-label="Add mood to your fields"]')).toBeNull();
  });

  it("offers to add an extra value as an option for a configured select field", async () => {
    const addedOptions: Array<{ fieldId: string; option: string }> = [];
    const host = await mount({
      // "down" is not in the mood field's options ["rough", "okay", "good"]
      contents: note("date: 2026-08-07\nmood: down\n"),
      applyEdit: () => {},
      onAddOption: (fieldId, option) => addedOptions.push({ fieldId, option })
    });

    await click(host, "Info Tracker");

    const button = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Add down as an option for Mood"]'
    );
    expect(button).not.toBeNull();
    await click(host, "Add down as an option for Mood");

    expect(addedOptions).toEqual([{ fieldId: "mood", option: "down" }]);
  });

  it("does not offer to add an option when onAddOption is absent", async () => {
    const host = await mount({
      contents: note("date: 2026-08-07\nmood: down\n"),
      applyEdit: () => {}
    });

    await click(host, "Info Tracker");

    expect(
      host.querySelector('button[aria-label="Add down as an option for Mood"]')
    ).toBeNull();
  });

  it("does not offer to add an option when the value matches an existing option", async () => {
    const host = await mount({
      // "good" is in the mood field's options
      contents: note("date: 2026-08-07\nmood: good\n"),
      applyEdit: () => {},
      onAddOption: () => {}
    });

    await click(host, "Info Tracker");

    expect(
      host.querySelector('button[aria-label="Add good as an option for Mood"]')
    ).toBeNull();
  });
});

describe("read-only mode when applyEdit is absent", () => {
  const note = (frontmatter: string) =>
    `---\n${frontmatter}---\n\nBread needed more salt.\n`;

  const mount = (props: Partial<React.ComponentProps<typeof MetadataWidgetContainer>> = {}) =>
    mountContainerHelper(note("date: 2026-08-07\n"), props);

  it("disables field controls when applyEdit is undefined", async () => {
    const host = await mount({
      contents: note("date: 2026-08-07\nmood: good\n"),
      applyEdit: undefined
    });

    await click(host, "Info Tracker");

    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Mood: good"]');
    expect(button?.hasAttribute("disabled")).toBe(true);
  });

  it("disables the add field row when applyEdit is undefined", async () => {
    const host = await mount({
      applyEdit: undefined
    });

    await click(host, "Info Tracker");

    expect(host.querySelector('button[aria-label="Add a field"]')?.hasAttribute("disabled")).toBe(true);
  });

  it("disables text input when applyEdit is undefined", async () => {
    const host = await mount({
      contents: note("date: 2026-08-07\nnote: Try 2% salt\n"),
      applyEdit: undefined
    });

    await click(host, "Info Tracker");

    const input = host.querySelector<HTMLInputElement>('input[aria-label="Note to self"]');
    expect(input?.hasAttribute("disabled")).toBe(true);
  });
});
