/**
 * Path input control for path-type settings.
 *
 * Renders a text input alongside a "Browse" button. The browse button opens
 * a native Tauri file picker via the `native/dialogs` bridge (never calling
 * Tauri IPC directly). In non-Tauri contexts (tests, web preview) the browse
 * button is disabled with a tooltip.
 */

import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { FolderOpen } from "lucide-react";
import { pickFilePath } from "../../native/dialogs";
import type { ControlProps } from "../controlRegistry";

/**
 * A path input with a native browse button.
 *
 * The text input is always editable (users can type/paste a path). The
 * browse button calls `pickFilePath()` which opens a native file dialog
 * inside Tauri and resolves to `null` outside Tauri. When not in Tauri,
 * the button renders disabled with a tooltip explaining why.
 */
export function PathControl({ definition, value, onChange, disabled }: ControlProps) {
  // Cache the Tauri check once; it never changes during a session.
  const [nativeAvailable] = useState(() => isTauri());
  const pathValue = typeof value === "string" ? value : String(value ?? "");

  async function handleBrowse() {
    const selected = await pickFilePath();
    if (selected !== null) onChange(selected);
  }

  return (
    <div className="flex w-full max-w-[24rem] items-center gap-2">
      <input
        type="text"
        id={definition.key}
        value={pathValue}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-small border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      />
      <button
        type="button"
        onClick={handleBrowse}
        disabled={disabled || !nativeAvailable}
        title={nativeAvailable ? "Browse for file" : "File browser not yet available"}
        className="flex shrink-0 items-center gap-1 rounded-small border border-border bg-surface px-2 py-1 text-xs text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring disabled:opacity-50"
      >
        <FolderOpen className="size-3.5" aria-hidden="true" />
        <span>Browse</span>
      </button>
    </div>
  );
}
