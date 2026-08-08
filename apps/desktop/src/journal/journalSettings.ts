import {
  validateFieldDefinition,
  type JournalFieldDefinition,
  type NoteDiagnostic
} from "@thinkbrain/core";

import type { DesktopExtensionSettingsSchema } from "../extensions/desktopExtensionHost";

/**
 * The journal's settings, exactly as D64 approved them.
 *
 * Four settings and no more. Notably absent, and deliberately so: templates
 * (D21), the folder-nesting and filename pattern (fixed by D17), any timezone
 * or day-start offset (D19), and anything naming a mood or activity — the
 * vocabulary is the user's, not ours (D4).
 */

/** Control key for the field-definition editor (D49). */
export const FIELD_DEFINITIONS_CONTROL = "journal-field-definitions";

const SECTION = "journal";

export const journalSettingsSchema: DesktopExtensionSettingsSchema = {
  label: "Journal",
  scope: "app",
  sections: [
    {
      id: SECTION,
      label: "Journal",
      settings: [
        {
          key: "root",
          type: "path",
          default: "journal",
          // Workspace-overridable: a vault of work notes and a personal vault
          // will not agree on where the journal lives (D7, D45).
          scope: "workspace",
          section: SECTION,
          label: "Journal folder",
          description: "Workspace folder holding journal entries."
        },
        {
          key: "fieldDefinitions",
          type: "string",
          control: FIELD_DEFINITIONS_CONTROL,
          default: "[]",
          scope: "workspace",
          section: SECTION,
          label: "Metadata fields",
          description:
            "Fields you can record on an entry. Defined per workspace, falling back to your global fields."
        },
        {
          key: "calendarDefaultView",
          type: "enum",
          options: ["week", "month"],
          default: "month",
          scope: "app",
          section: SECTION,
          label: "Default calendar view",
          description: "View the calendar opens in."
        },
        {
          key: "startOfWeek",
          type: "enum",
          options: ["system", "monday", "sunday"],
          default: "system",
          scope: "app",
          section: SECTION,
          label: "First day of the week",
          description: "Day the calendar's week starts on."
        }
      ]
    }
  ]
};

export interface FieldDefinitionsResult {
  readonly definitions: readonly JournalFieldDefinition[];
  readonly diagnostics: readonly NoteDiagnostic[];
}

const warning = (code: string, message: string): NoteDiagnostic => ({
  code,
  message,
  severity: "warning"
});

/**
 * Reads the stored field-definition list.
 *
 * Never throws: a malformed setting reports itself and yields no fields, rather
 * than taking down whatever is rendering the journal. One bad definition does
 * not discard the good ones.
 */
export function parseFieldDefinitions(raw: unknown): FieldDefinitionsResult {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return { definitions: [], diagnostics: [] };
  }

  let parsed: unknown;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (cause: unknown) {
    return {
      definitions: [],
      diagnostics: [
        warning(
          "journal_fields_invalid_json",
          `Metadata fields are not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`
        )
      ]
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      definitions: [],
      diagnostics: [warning("journal_fields_not_a_list", "Metadata fields must be a list.")]
    };
  }

  const definitions: JournalFieldDefinition[] = [];
  const diagnostics: NoteDiagnostic[] = [];
  const seen = new Set<string>();

  for (const entry of parsed) {
    const result = validateFieldDefinition(entry);
    if (!result.definition) {
      diagnostics.push(...result.diagnostics);
      continue;
    }
    if (seen.has(result.definition.id)) {
      // Two definitions for one frontmatter key cannot both be right, and
      // silently picking one would make the file's meaning depend on order.
      diagnostics.push(
        warning(
          "journal_field_duplicate",
          `Metadata field "${result.definition.id}" is defined more than once; the first is used.`
        )
      );
      continue;
    }
    seen.add(result.definition.id);
    definitions.push(result.definition);
  }

  return { definitions, diagnostics };
}
