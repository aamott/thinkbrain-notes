import { Check, Copy } from "lucide-react";

import type { NotificationItem } from "../notifications/notificationTypes";

/**
 * One notification's card body — title, message, recovery hint, technical
 * details, and the action/dismiss/copy button row. Shared by the status
 * bar's toast and each row of the bell log so the two surfaces cannot drift:
 * both render the same card, only the wrapper (floating `aside` vs log `li`)
 * differs.
 */
export function NotificationCard({
  item,
  copied,
  onCopied,
  onDismiss
}: {
  readonly item: NotificationItem;
  /** True while the "Copied" confirmation is showing. */
  readonly copied: boolean;
  /** Called when the copy button is pressed. */
  readonly onCopied: () => void;
  readonly onDismiss: () => void;
}) {
  return (
    <>
      <p className="m-0 text-sm font-semibold">{item.title}</p>
      <p className="mb-0 mt-1 text-xs leading-relaxed">{item.message}</p>
      {item.recovery && (
        <p className="mb-0 mt-1 text-xs leading-relaxed text-muted-foreground">{item.recovery}</p>
      )}
      <Diagnostic details={item.details} />
      <div className="mt-2 flex items-center gap-2">
        {item.action && (
          <button
            type="button"
            className="rounded-small border border-border bg-surface px-2 py-1 text-xs"
            onClick={() => item.action?.onClick()}
          >
            {item.action.label}
          </button>
        )}
        <button
          type="button"
          className="rounded-small px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
        >
          Dismiss
        </button>
        <button
          type="button"
          className="ml-auto flex items-center gap-1 rounded-small px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          aria-label={copied ? "Copied" : "Copy message"}
          onClick={() => {
            void navigator.clipboard.writeText(notificationText(item));
            onCopied();
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </>
  );
}

function Diagnostic({ details }: { readonly details?: string }) {
  if (!details) return null;
  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer">Technical details</summary>
      <p className="mb-0 mt-1 break-words font-mono">{details}</p>
    </details>
  );
}

/**
 * Composes the full notification text for copying — title, message, recovery,
 * and any technical details — so a user can paste a complete report in one
 * click. Source-agnostic: works for any notification, not just sync.
 */
function notificationText(item: NotificationItem): string {
  const lines = [item.title, item.message];
  if (item.recovery) lines.push(item.recovery);
  if (item.details) lines.push(`Technical details: ${item.details}`);
  return lines.filter(Boolean).join("\n");
}
