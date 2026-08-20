# A crash mid-conflict multiplies the copies

Carried from story 6b. A conflict copy is written before the merge is recorded,
so an interruption between the two leaves the copy behind; the next attempt
sees the name taken and writes ` 2`, then ` 3`.

## Acceptance

- [x] An interrupted sync does not leave a growing stack of numbered copies
      of the same conflict

The unnumbered `note (from another device).md` is this conflict's slot.
`beside_in` reuses that file; numbering is only for a name that cannot be
overwritten (a folder sitting on the slot). Identical bytes are not rewritten.

## Status

🟩 Done.
