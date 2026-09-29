/**
 * The CodeMirror pieces every editor surface in the app shares.
 *
 * The highlight style reads `--tn-syntax-*` tokens so syntax colors follow
 * the active theme and custom themes can override them, and
 * `languageForPath` maps a file onto the lazily-loaded grammar index from
 * `@codemirror/language-data` — every editor highlights the same way without
 * paying for languages nobody opened.
 */

import { HighlightStyle, type LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { tags as t } from "@lezer/highlight";

/**
 * Syntax highlighting theme using the app's `--tn-syntax-*` CSS tokens, so
 * colors adapt to light/dark themes automatically and custom themes can
 * override syntax colors. Apply with `syntaxHighlighting(style, { fallback: true })`
 * so CodeMirror's defaultHighlightStyle covers any tags not styled here.
 */
export const codeHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "var(--tn-color-syntax-keyword)" },
  { tag: [t.name, t.deleted, t.character], color: "var(--tn-color-syntax-variable)" },
  { tag: t.function(t.variableName), color: "var(--tn-color-syntax-function)" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "var(--tn-color-syntax-keyword)" },
  { tag: [t.definition(t.name), t.propertyName], color: "var(--tn-color-syntax-property)" },
  { tag: [t.typeName, t.className, t.annotation, t.modifier, t.self, t.namespace], color: "var(--tn-color-syntax-type)" },
  { tag: [t.number, t.changed], color: "var(--tn-color-syntax-number)" },
  { tag: [t.operator, t.punctuation, t.separator], color: "var(--tn-color-syntax-operator)" },
  { tag: [t.comment, t.quote], color: "var(--tn-color-syntax-comment)", fontStyle: "italic" },
  { tag: [t.meta, t.documentMeta], color: "var(--tn-color-syntax-comment)" },
  { tag: [t.string, t.special(t.string)], color: "var(--tn-color-syntax-string)" },
  { tag: [t.regexp, t.escape], color: "var(--tn-color-syntax-keyword)" },
  { tag: [t.url, t.link], color: "var(--tn-color-syntax-keyword)", textDecoration: "underline" },
  { tag: t.invalid, color: "var(--tn-color-syntax-invalid)" }
]);

/** Maps a file extension to a CodeMirror language description for lazy loading. */
export function languageForPath(relativePath: string): LanguageDescription | undefined {
  const dot = relativePath.lastIndexOf(".");
  if (dot < 0) return undefined;
  const ext = relativePath.slice(dot + 1).toLowerCase();
  return languages.find((lang) => lang.extensions?.includes(ext));
}
