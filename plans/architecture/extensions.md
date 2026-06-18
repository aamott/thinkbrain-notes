# Extensions

## Goal

Keep the architecture extensible without letting the MVP become a full plugin platform.

## MVP Decision

MVP supports internal contribution points only.

Examples:

- command registry for app-owned commands
- activity/sidebar registration for built-in panels
- editor command hooks for built-in features
- settings schema registration for built-in modules

## Deferred Public Extension System

Future extension capabilities may include:

- `extension.json` manifest
- install from file
- install from URL
- sandboxed execution
- permission declarations
- views
- panels
- menus
- editor actions
- settings contributions
- themes
- AI tools
- Git tools
- static registry

These are not MVP features.

## Security Principle

No third-party code should receive unrestricted filesystem access. Public extension execution requires a separate security design before implementation.
