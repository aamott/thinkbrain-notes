# Themes

## Goal

Provide a simple theme foundation without building a full extension system during MVP.

## MVP Decision

Themes use CSS variables and app-defined design tokens.

MVP may include:

- default light theme
- default dark theme
- theme token definitions
- user setting for selected built-in theme

## Future Direction

Long term, themes may be packaged as extensions. That does not mean MVP should implement third-party extension loading.

## Non-Goals for MVP

Do not implement:

- installable theme packages
- theme marketplace
- signed theme bundles
- arbitrary remote theme loading
