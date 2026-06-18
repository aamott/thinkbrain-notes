# Extension System

## Philosophy

Keep extensions simple.

Avoid browser-like complexity.

Avoid security problems.

## Distribution

For Version 1, there is no heavy marketplace backend server. 
Extensions are distributed purely via:
- Install from URL
- Install from File (sideloading)

In the future, a static extension registry will be hosted (e.g., GitHub Pages) rather than a custom backend.

---

## Package Layout

extension.json

main.ts

assets/

README.md

LICENSE

---

## Capabilities

Commands

Views

Panels

Menus

Editor actions

Settings

Themes

Language support

AI tools

Git tools

---

## Security

Permissions declared in manifest.

No unrestricted filesystem access.

Sandboxed execution.

No native code.

Signed marketplace packages.

Local sideloading always allowed.