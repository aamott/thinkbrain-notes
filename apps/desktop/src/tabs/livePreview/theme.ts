import { EditorView } from "@codemirror/view";

/**
 * Live-preview typography and chrome.
 *
 * Prose switches to the proportional UI font while code keeps monospace; the
 * editor's base `font-mono` class still applies when live preview is off, so
 * toggling the compartment swaps fonts with no extra wiring. Every color is a
 * `--tn-*` token so imported themes restyle the editor for free.
 */
/**
 * The rule set, exported so a test can assert that a class it relies on is
 * actually styled — a class name alone proves nothing about what is rendered.
 */
export const themeRules = {
  ".cm-content": {
    fontFamily: "var(--tn-font-sans)"
  },

  ".cm-heading": {
    fontWeight: "700",
    lineHeight: "1.3"
  },
  ".cm-h1": { fontSize: "1.9em" },
  ".cm-h2": { fontSize: "1.55em" },
  ".cm-h3": { fontSize: "1.3em" },
  ".cm-h4": { fontSize: "1.15em" },
  ".cm-h5": { fontSize: "1.05em" },
  ".cm-h6": {
    fontSize: "0.95em",
    color: "var(--tn-color-muted-foreground)",
    textTransform: "uppercase",
    letterSpacing: "0.04em"
  },

  ".cm-strong": { fontWeight: "700" },
  ".cm-em": { fontStyle: "italic" },
  ".cm-strike": {
    textDecoration: "line-through",
    color: "var(--tn-color-muted-foreground)"
  },

  ".cm-inline-code": {
    fontFamily: "var(--tn-font-mono)",
    fontSize: "0.88em",
    backgroundColor:
      "color-mix(in srgb, var(--tn-color-muted-foreground) 12%, transparent)",
    padding: "0.08em 0.35em",
    borderRadius: "4px"
  },
  ".cm-code-line": {
    fontFamily: "var(--tn-font-mono)",
    fontSize: "0.88em",
    backgroundColor:
      "color-mix(in srgb, var(--tn-color-muted-foreground) 10%, transparent)"
  },
  ".cm-code-line-first": { borderRadius: "6px 6px 0 0", paddingTop: "0.25em" },
  ".cm-code-line-last": { borderRadius: "0 0 6px 6px", paddingBottom: "0.25em" },

  ".cm-quote-line": {
    borderLeft: "3px solid var(--tn-color-border)",
    paddingLeft: "0.8em",
    color: "var(--tn-color-muted-foreground)",
    fontStyle: "italic"
  },
  ".cm-hr-line": {
    position: "relative",
    height: "1.5em"
  },
  ".cm-hr-line::before": {
    content: '""',
    position: "absolute",
    left: "0",
    right: "0",
    top: "50%",
    borderTop: "1px solid var(--tn-color-border)"
  },

  ".cm-list-mark": {
    color: "var(--tn-color-primary)",
    fontWeight: "600"
  },
  ".cm-task-checkbox-wrap": {
    display: "inline-flex",
    alignItems: "center",
    marginRight: "0.35em"
  },
  ".cm-task-checkbox": {
    width: "15px",
    height: "15px",
    accentColor: "var(--tn-color-primary)",
    cursor: "pointer"
  },
  ".cm-task-done": {
    color: "var(--tn-color-muted-foreground)",
    textDecoration: "line-through"
  },

  ".cm-link-text": {
    color: "var(--tn-color-primary)",
    textDecoration: "underline",
    textUnderlineOffset: "3px"
  },
  ".cm-link-resolved": {
    cursor: "pointer",
    color: "var(--tn-color-primary)"
  },
  ".cm-link-broken": {
    color: "var(--tn-color-muted-foreground)",
    textDecoration: "line-through",
    cursor: "default"
  },
  ".cm-image-text": {
    color: "var(--tn-color-muted-foreground)",
    fontStyle: "italic"
  },
  ".cm-image-wrap": { display: "inline-block" },
  ".cm-image": {
    maxWidth: "100%",
    borderRadius: "6px",
    verticalAlign: "bottom"
  },

  ".cm-table-line": {
    fontFamily: "var(--tn-font-mono)",
    fontSize: "0.88em",
    fontVariantNumeric: "tabular-nums"
  },
  ".cm-table-header": { fontWeight: "700" },
  ".cm-table-delimiter": {
    borderBottom: "1px solid var(--tn-color-border)"
  },

  ".cm-syntax-mark": {
    color: "var(--tn-color-muted-foreground)",
    opacity: "0.7"
  },

  ".cm-frontmatter": {
    fontFamily: "var(--tn-font-mono)",
    fontSize: "0.85em",
    color: "var(--tn-color-muted-foreground)",
    backgroundColor:
      "color-mix(in srgb, var(--tn-color-muted-foreground) 8%, transparent)",
    borderLeft: "2px solid var(--tn-color-border)",
    paddingLeft: "0.6em"
  },
  ".cm-frontmatter-first": { paddingTop: "0.25em" },
  ".cm-frontmatter-last": { paddingBottom: "0.25em" },
  // D88: out of the way while reading. Hidden rather than removed, so the
  // document is untouched and the block returns the moment the cursor does.
  ".cm-frontmatter-hidden": { display: "none" }
} as const;

export const livePreviewTheme = EditorView.theme(themeRules);
