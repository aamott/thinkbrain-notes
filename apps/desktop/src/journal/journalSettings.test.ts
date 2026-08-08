import { describe, expect, it } from "vitest";

import { journalSettingsSchema, parseFieldDefinitions } from "./journalSettings";

/** The exact settings D64 approved — no more, no fewer. */
describe("journalSettingsSchema", () => {
  const settings = journalSettingsSchema.sections.flatMap((section) => section.settings ?? []);
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));

  it("registers exactly the four approved settings", () => {
    expect([...byKey.keys()].sort()).toEqual([
      "calendarDefaultView",
      "fieldDefinitions",
      "root",
      "startOfWeek"
    ]);
  });

  it("defaults the journal root to journal and allows a workspace override", () => {
    expect(byKey.get("root")).toMatchObject({ type: "path", default: "journal", scope: "workspace" });
  });

  it("renders field definitions through the custom control", () => {
    expect(byKey.get("fieldDefinitions")).toMatchObject({
      type: "string",
      control: "journal-field-definitions",
      default: "[]",
      scope: "workspace"
    });
  });

  it("offers the approved calendar view and week-start options", () => {
    expect(byKey.get("calendarDefaultView")).toMatchObject({
      type: "enum",
      options: ["week", "month"],
      default: "month",
      scope: "app"
    });
    expect(byKey.get("startOfWeek")).toMatchObject({
      type: "enum",
      options: ["system", "monday", "sunday"],
      default: "system",
      scope: "app"
    });
  });

  it("declares no mood, activity, or template setting", () => {
    // D4 keeps the vocabulary user-defined; D21 keeps templates out of v1.
    const keys = [...byKey.keys()].join(" ").toLowerCase();
    expect(keys).not.toMatch(/mood|activity|template/);
  });
});

describe("parseFieldDefinitions", () => {
  const definition = (overrides: Record<string, unknown> = {}) => ({
    id: "energy",
    label: "Energy",
    type: "number",
    ...overrides
  });

  it("reads a JSON array of definitions", () => {
    const result = parseFieldDefinitions(JSON.stringify([definition()]));

    expect(result.definitions).toEqual([{ id: "energy", label: "Energy", type: "number" }]);
    expect(result.diagnostics).toEqual([]);
  });

  it("treats an empty or missing value as no fields", () => {
    expect(parseFieldDefinitions("").definitions).toEqual([]);
    expect(parseFieldDefinitions(undefined).definitions).toEqual([]);
    expect(parseFieldDefinitions("[]").definitions).toEqual([]);
  });

  it("reports invalid JSON without throwing", () => {
    const result = parseFieldDefinitions("[{ not json");

    expect(result.definitions).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe("journal_fields_invalid_json");
  });

  it("reports a value that is not an array", () => {
    const result = parseFieldDefinitions(JSON.stringify(definition()));

    expect(result.definitions).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe("journal_fields_not_a_list");
  });

  it("keeps the valid definitions when one is malformed", () => {
    const result = parseFieldDefinitions(
      JSON.stringify([definition(), definition({ id: "Bad Id" })])
    );

    expect(result.definitions.map((field) => field.id)).toEqual(["energy"]);
    expect(result.diagnostics).toHaveLength(1);
  });

  it("rejects a duplicate id and keeps the first definition", () => {
    const result = parseFieldDefinitions(
      JSON.stringify([definition(), definition({ label: "Energy again" })])
    );

    expect(result.definitions).toHaveLength(1);
    expect(result.definitions[0]?.label).toBe("Energy");
    expect(result.diagnostics[0]?.code).toBe("journal_field_duplicate");
  });
});
