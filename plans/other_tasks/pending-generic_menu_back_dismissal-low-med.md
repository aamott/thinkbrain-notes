# Story: Generic menus dismiss before mobile navigation

The shared `apps/desktop/src/shell/Menu.tsx` handles Escape and outside taps,
but does not register with the dismissable overlay stack. Phone header and
Android Back therefore navigate past an open settings overflow or context
menu instead of closing it first. Verified during the mobile UI cleanup.

## Acceptance

- [ ] Header and Android Back dismiss the top generic menu without changing the content route or history depth, including at Files home.
- [ ] Menus remain ephemeral: Forward never resurrects them.
- [ ] Preserve arrow-key navigation, current-item focus, anchor toggle behavior, and outside-tap focus semantics.
- [ ] Nested menus dismiss before the drawer/dialog beneath them; hidden or unmounted menus leave no registered handler.
- [ ] Add shared-menu unit coverage and phone browser regressions for settings overflow and an explorer context menu.

Reuse the overlay dismissal registry, but separate registration from modal
focus trapping/restoration if needed. Do not blindly replace the menu's
behavior with `useDismissable`: outside taps intentionally differ from Escape.

Relevant seams: `packages/ui/src/components/ui/use-dismissable.ts`,
`apps/desktop/src/shell/phone/usePhoneNavigation.ts`, and
`apps/desktop/src/settings/SettingsHeaderBar.tsx`.
