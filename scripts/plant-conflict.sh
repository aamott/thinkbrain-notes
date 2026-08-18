#!/usr/bin/env bash
#
# Plants the mess a sync daemon leaves behind, without needing a sync daemon.
#
# Auto Sync decides a conflict from one thing only: a file turned up in the
# vault whose name matches a known provider's shape, and the note it names
# exists. Nothing asks a daemon anything, and nothing needs a remote — so a
# conflict can be staged with `cp`.
#
# What this proves and what it does not: it exercises every line of ours —
# detection, pairing, the triage cards, the comparison, the write, the
# checkpoint, the footer, History and Restore. It proves nothing about whether
# the *shape* is the one Syncthing really produces, because we chose the name
# here. That question needs a real daemon, and it is the one open task in
# `plans/auto-sync/pending-cloud_conflict_detection-high-med.md`.
#
# Usage: scripts/plant-conflict.sh <vault-directory>

set -euo pipefail

VAULT="${1:-}"
if [[ -z "$VAULT" || ! -d "$VAULT" ]]; then
  echo "usage: $0 <vault-directory>" >&2
  exit 2
fi

# The shape `conflict.rs` matches: marker, then date-time-device.
STAMP="$(date +%Y%m%d-%H%M%S)"
copy_of() {
  local base="$1" extension="$2"
  printf '%s.sync-conflict-%s-K3SDFHG%s' "$base" "$STAMP" "$extension"
}

# 1. A note worth comparing: same opening, one paragraph each side wrote
#    differently, same ending. Three chunks, one of them a real choice.
cat > "$VAULT/Meeting Notes.md" <<'NOTE'
# Q3 sync

Attendees: Sam, Rae, Jo

Follow up with design about the empty states.

Next check-in: 18 Aug
NOTE

cat > "$VAULT/$(copy_of 'Meeting Notes' '.md')" <<'NOTE'
# Q3 sync

Attendees: Sam, Rae, Jo

Rae is syncing directly with design, so no follow-up needed.

Next check-in: 18 Aug
NOTE

# 2. Something that cannot be compared line by line, so the card has to carry
#    the whole decision itself. The header carries the NUL bytes the binary
#    sniff looks for, rather than leaving that to chance in the random tail.
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR\x00\x00\x01\x00\x00\x00\x01\x00' > "$VAULT/diagram.png"
head -c 4096 /dev/urandom >> "$VAULT/diagram.png"
cp "$VAULT/diagram.png" "$VAULT/$(copy_of 'diagram' '.png')"
head -c 512 /dev/urandom >> "$VAULT/$(copy_of 'diagram' '.png')"

# 3. A whiteboard: text, and so technically comparable, which is exactly why
#    the card refuses to offer a comparison of it.
printf '{"nodes":[{"id":"a","text":"ship it"}],"edges":[]}\n' > "$VAULT/Roadmap.canvas"
printf '{"nodes":[{"id":"a","text":"ship it Friday"}],"edges":[]}\n' \
  > "$VAULT/$(copy_of 'Roadmap' '.canvas')"

echo "Planted three conflicts in $VAULT:"
echo "  Meeting Notes.md  — a note to compare and merge"
echo "  diagram.png       — a picture, decided from the card"
echo "  Roadmap.canvas    — a whiteboard, which says why it cannot be compared"
echo
echo "Open that folder in ThinkBrain. The activity bar's ⇄ icon should carry a 3."
