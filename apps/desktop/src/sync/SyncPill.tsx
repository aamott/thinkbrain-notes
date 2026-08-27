import { describePill } from "./syncCopy";
import type { SyncStatus } from "./historyTypes";

/**
 * What the footer says about saving, and the way to the surfaces behind it.
 *
 * The footer is the only place someone who never opens a panel will learn that
 * their notes stopped being saved, so it is a button rather than a label: what
 * it reports, it can also take you to.
 */
export function SyncPill({
  status,
  onOpen,
  compact = false
}: {
  readonly status: SyncStatus;
  /** Somewhere to go about it: the list to decide, or the history to look. */
  readonly onOpen: (panel: "conflicts" | "history") => void;
  /** Symbol-only — for the phone header, where the full sentence eats title space. */
  readonly compact?: boolean;
}) {
  const pill = describePill(status);

  return (
    <button
      type="button"
      className={`flex items-center gap-1 border-0 bg-transparent px-1 font-inherit text-inherit ${
        pill.tone === "warn" ? "text-danger" : ""
      }`}
      title={pill.detail}
      aria-label={pill.detail}
      onClick={() => onOpen(status.state === "attention" ? "conflicts" : "history")}
    >
      <span aria-hidden="true">{pill.symbol}</span>
      {!compact && pill.text}
    </button>
  );
}
