import {
  Bold,
  Code,
  Heading,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Strikethrough
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import type { MarkdownFormatAction } from "../../tabs/markdownFormat";

// Sized on the icons, not the button's `[&>svg]` — a `size-*` on the button
// alongside a `[&>svg]:size-*` reads as a duplicate to the Tailwind lint.
const ICON = "size-[1.05rem] stroke-current";

const ACTIONS: readonly { action: MarkdownFormatAction; label: string; icon: ReactNode }[] = [
  { action: "bold", label: "Bold", icon: <Bold className={ICON} /> },
  { action: "italic", label: "Italic", icon: <Italic className={ICON} /> },
  { action: "strikethrough", label: "Strikethrough", icon: <Strikethrough className={ICON} /> },
  { action: "code", label: "Code", icon: <Code className={ICON} /> },
  { action: "heading", label: "Heading", icon: <Heading className={ICON} /> },
  { action: "bullet-list", label: "Bullet list", icon: <List className={ICON} /> },
  { action: "numbered-list", label: "Numbered list", icon: <ListOrdered className={ICON} /> },
  { action: "task-list", label: "Task list", icon: <ListChecks className={ICON} /> },
  { action: "quote", label: "Quote", icon: <Quote className={ICON} /> },
  { action: "link", label: "Link", icon: <Link className={ICON} /> }
];

/**
 * The phone shell's Markdown formatting bar, pinned just above the soft
 * keyboard while it is open.
 *
 * Every button swallows `pointerdown`/`mousedown`: letting the press reach
 * the browser would blur the editor, drop the keyboard, and dismiss the bar
 * before the tap's `click` ever fired. The action runs on `click`, when the
 * editor's focus has provably survived.
 */
export function FormattingBar({
  onFormat
}: {
  readonly onFormat: (action: MarkdownFormatAction) => void;
}) {
  return (
    // `group`, not `toolbar`: a toolbar promises roving-focus keyboard
    // handling between its buttons, which this bar does not implement — same
    // call FloatingBubbles makes.
    <div
      role="group"
      aria-label="Formatting"
      className={cn(
        "flex gap-1 overflow-x-auto rounded-full border border-border bg-surface text-surface-foreground shadow-panel px-2 py-1",
        "mx-[max(0.5rem,env(safe-area-inset-left))] mr-[max(0.5rem,env(safe-area-inset-right))] mb-1"
      )}
    >
      {ACTIONS.map(({ action, label, icon }) => (
        <button
          key={action}
          type="button"
          aria-label={label}
          title={label}
          // 40px clears the touch minimum without turning the bar into a band.
          className="flex size-10 flex-none cursor-pointer items-center justify-center rounded-full tn-focus-ring hover:bg-accent"
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onFormat(action)}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
