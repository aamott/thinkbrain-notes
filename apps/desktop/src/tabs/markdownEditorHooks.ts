import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";

import {
  createDesktopEditorHookRegistry,
  type DesktopEditorHookRegistry
} from "./editorHookRegistry";

/** Runtime callbacks supplied by the controlled Markdown editor instance. */
export interface MarkdownEditorHookPayload {
  /** Reports a CodeMirror document change to the controlled React value. */
  readonly onChange: (value: string) => void;
  /** Requests persistence of the current document. */
  readonly onSave: () => void;
}

/** The context is intentionally empty because these hooks need no host state. */
type MarkdownEditorHookContext = undefined;

/** The typed registry used to assemble every built-in Markdown editor hook. */
export type MarkdownEditorHookRegistry = DesktopEditorHookRegistry<
  MarkdownEditorHookPayload,
  MarkdownEditorHookContext
>;

/**
 * Built-in Markdown editor hooks in their intended assembly order.
 *
 * The separate keybinding contributions are merged by `MarkdownEditor` into one
 * CodeMirror `keymap` extension, leaving future extensions free to add bindings
 * without editing the editor component itself.
 */
export const markdownEditorHookRegistry: MarkdownEditorHookRegistry =
  createDesktopEditorHookRegistry<MarkdownEditorHookPayload, MarkdownEditorHookContext>([
    {
      id: "history",
      order: 10,
      extensions: () => [history()]
    },
    {
      id: "markdown-language",
      order: 20,
      extensions: () => [markdown()]
    },
    {
      id: "line-wrapping",
      order: 30,
      extensions: () => [EditorView.lineWrapping]
    },
    {
      id: "cursor-theme",
      order: 40,
      extensions: () => [
        // CodeMirror draws a focused cursor separately from the native caret.
        // Set both colors so the cursor remains visible on the dark editor theme.
        EditorView.theme(
          {
            ".cm-content": { caretColor: "var(--tn-color-foreground)" },
            ".cm-cursor, .cm-dropCursor": {
              borderLeftColor: "var(--tn-color-foreground)"
            },
            "&.cm-focused .cm-cursor": {
              borderLeftColor: "var(--tn-color-foreground)"
            }
          },
          { dark: true }
        )
      ]
    },
    {
      id: "aria-content-attributes",
      order: 50,
      extensions: () => [
        EditorView.contentAttributes.of({ "aria-label": "Markdown editor" })
      ]
    },
    {
      id: "default-keybindings",
      order: 60,
      keybindings: () => [...defaultKeymap]
    },
    {
      id: "history-keybindings",
      order: 70,
      keybindings: () => [...historyKeymap]
    },
    {
      id: "tab-keybinding",
      order: 80,
      keybindings: () => [indentWithTab]
    },
    {
      id: "save-keybinding",
      order: 90,
      keybindings: (payload) => [
        {
          key: "Mod-s",
          // `Mod` maps to Command on Apple platforms and Control elsewhere,
          // including mobile browser keyboard environments.
          run: () => {
            payload.onSave();
            return true;
          }
        }
      ]
    },
    {
      id: "update-listener",
      order: 100,
      extensions: (payload) => [
        EditorView.updateListener.of((update) => {
          if (update.docChanged) payload.onChange(update.state.doc.toString());
        })
      ]
    }
  ]);
