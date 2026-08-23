/**
 * Tells the user a note went empty from a change the app did not make.
 *
 * The shape of `StaleDocumentBanner` on purpose: same situation from the user's
 * side — something outside the app changed a note they have open — and the same
 * rules. Not a modal, because they did not ask for this and may be mid-
 * sentence; `role="status"` with a polite live region announces it without
 * interrupting; it sits above the tab it is about, so several notes emptied at
 * once do not pile into one alert.
 *
 * The editor stays open and editable underneath. An empty note is still a note
 * someone may want to type into, and taking the tab away to show a recovery
 * screen would be deciding for them that this was damage. The banner offers the
 * kept versions and otherwise stays out of the way.
 *
 * Dismissing does not write. Keeping the note empty is what the file already
 * says; replacing it takes the same deliberate restore it always took.
 */

import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import { bannerButtonClass } from "./bannerButton";
import { NoteVersionList } from "./NoteVersionList";

/** Props for {@link EmptiedNoteBanner}. */
export interface EmptiedNoteBannerProps {
  readonly rootPath: string;
  readonly relativePath: string;
  readonly fileName: string;
  /** Stops asking about this one. Deliberately writes nothing. */
  readonly onDismiss: () => void;
  /** Re-reads the note, once a version has been put back. */
  readonly onRestored: () => void;
}

export function EmptiedNoteBanner({
  rootPath,
  relativePath,
  fileName,
  onDismiss,
  onRestored
}: EmptiedNoteBannerProps) {
  const [showingVersions, setShowingVersions] = useState(false);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-2 py-[0.6rem] px-[0.9rem] border-b border-warning/40 bg-warning/10"
    >
      <div className="flex flex-wrap items-center gap-3">
        <AlertTriangle className="shrink-0 size-[1.05rem] text-warning" aria-hidden="true" />
        <p className="flex-1 min-w-3xs m-0 text-xs text-foreground">
          <strong className="font-medium">{fileName}</strong> was emptied by something outside the
          app.
        </p>
        <button
          type="button"
          className={bannerButtonClass}
          onClick={() => setShowingVersions((showing) => !showing)}
          aria-expanded={showingVersions}
        >
          {showingVersions ? "Hide kept versions" : "Show kept versions"}
        </button>
        <button type="button" className={bannerButtonClass} onClick={onDismiss}>
          Leave it empty
        </button>
      </div>
      {showingVersions && (
        <NoteVersionList
          rootPath={rootPath}
          relativePath={relativePath}
          onRestored={onRestored}
        />
      )}
    </div>
  );
}
