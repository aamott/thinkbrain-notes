# Duplicate Keyboard Logic in Command Palette

**Urgency:** Medium
**Difficulty:** Medium

The array of supported keys (`"Escape", "Enter", "ArrowUp", "ArrowDown", "Home", "End"`) is duplicated. It appears as an array literal in `CommandPalette.tsx`'s `handleKeyDown` and as the union type `CommandPaletteKey` in `commandPaletteModel.ts`.

## Action Item
- Export an array of keys or a type guard (e.g., `isCommandPaletteKey`) from `commandPaletteModel.ts`.
- Refactor `CommandPalette.tsx` to use this exported helper/constant to validate the key instead of redefining the array inline.
