// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  JournalFieldDefinitionsControl,
  registerJournalControls
} from "./JournalFieldDefinitionsControl";
import { getControlForDefinition, type ControlProps } from "../settings/controlRegistry";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const definition = {
  key: "extension-journal-calendar.fieldDefinitions",
  type: "string",
  label: "Metadata fields",
  description: "Fields you can record on an entry.",
  default: "[]",
  scope: "workspace",
  section: "journal"
} as ControlProps["definition"];

const render = async (props: Partial<ControlProps> = {}): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <JournalFieldDefinitionsControl
        definition={definition}
        value={props.value ?? "[]"}
        onChange={props.onChange ?? (() => undefined)}
        disabled={props.disabled}
      />
    )
  );
  return container;
};

const type = async (element: HTMLTextAreaElement, text: string): Promise<void> => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    setter?.call(element, text);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("JournalFieldDefinitionsControl", () => {
  it("shows the stored definitions for editing", async () => {
    const host = await render({
      value: JSON.stringify([{ id: "energy", label: "Energy", type: "number" }])
    });

    const editor = host.querySelector("textarea");
    expect(editor?.value).toContain('"energy"');
  });

  it("summarises the configured fields", async () => {
    const host = await render({
      value: JSON.stringify([
        { id: "energy", label: "Energy", type: "number" },
        { id: "mood", label: "Mood", type: "single-select", options: ["good"] }
      ])
    });

    expect(host.textContent).toContain("Energy");
    expect(host.textContent).toContain("Mood");
  });

  it("saves an edit that parses", async () => {
    const onChange = vi.fn();
    const host = await render({ onChange });
    const next = JSON.stringify([{ id: "energy", label: "Energy", type: "number" }]);

    await type(host.querySelector("textarea")!, next);

    expect(onChange).toHaveBeenCalledWith(next);
  });

  it("explains an invalid edit and does not save it", async () => {
    // Saving a broken definition would strand every value it describes.
    const onChange = vi.fn();
    const host = await render({ onChange });

    await type(host.querySelector("textarea")!, "[{ not json");

    expect(onChange).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/valid JSON/i);
  });

  it("explains a definition that breaks a rule and does not save it", async () => {
    const onChange = vi.fn();
    const host = await render({ onChange });

    await type(
      host.querySelector("textarea")!,
      JSON.stringify([{ id: "date", label: "Date", type: "text" }])
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/reserved/i);
  });

  it("keeps the field editable and labelled for assistive technology", async () => {
    const host = await render();
    const editor = host.querySelector("textarea");

    expect(editor?.getAttribute("aria-label")).toBe("Metadata fields, JSON");
    expect(editor?.disabled).toBe(false);
  });

  it("disables editing when the setting is disabled", async () => {
    const host = await render({ disabled: true });

    expect(host.querySelector("textarea")?.disabled).toBe(true);
  });

  it("is resolved for the journal's field-definitions setting once registered", async () => {
    registerJournalControls();

    expect(
      getControlForDefinition({ ...definition, control: "journal-field-definitions" })
    ).toBe(JournalFieldDefinitionsControl);
  });
});
