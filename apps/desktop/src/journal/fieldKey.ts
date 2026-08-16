/**
 * Converts a user-facing label into a valid frontmatter key.
 *
 * D49 defines the rule: lowercase alphanumeric and dashes, with no leading
 * digit (prefixed `f-` if the slug starts with one). Used both when naming a
 * field inline (D86, AddFieldRow) and when defining one in settings (D82,
 * JournalFieldDefinitionsControl).
 */
export function deriveFieldKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return /^[0-9]/.test(slug) ? `f-${slug}` : slug;
}
