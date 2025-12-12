# Theme Surface Strategy

## Goals
- Apply a dynamic surface color (`--color-surface`) to all card-like modules so they follow Light/Dark/Brand selections.
- Preserve a static white surface (`--color-surface-static`) for the Beosztas app grid so colored shift bands remain visible.
- Keep public/guest pages on their existing styling without adopting the dynamic surface layer.

## Variable definitions
- `--color-surface`: dynamic card/widget background that changes per base theme and brand overlay.
- `--color-surface-static`: always `#ffffff`; used only in Beosztas schedule views.

## ThemeManager responsibilities
- Manage both variables in the cleared/apply list during `useLayoutEffect`.
- For base Light/Dark palettes, set `--color-surface` accordingly (e.g., light: `#ffffff` or pale tint; dark: slate/graphite surface). Keep `--color-surface-static` hardcoded to `#ffffff` regardless of theme.
- When brand mode is active, allow `--color-surface` to be overridden if a brand surface/background is provided, but never override `--color-surface-static`.
- Continue to add/remove the `no-transition` guard during variable updates to avoid flicker.

## Components to migrate to `--color-surface`
Replace `bg-white` (or equivalent hardcoded surfaces) with `bg-[var(--color-surface)]` and ensure text uses the theme text variables for contrast:
- Dashboard widgets/cards.
- Reservation/Booking cards and booking list items.
- Task/To-do item cards.
- Knowledge base cards/tiles.
- Payroll/Bérezés module cards and panels.

### Exceptions
- Beosztas app: retain `bg-[var(--color-surface-static)]` (white) for the grid and shift containers.
- Public pages: leave existing backgrounds intact (do not switch to dynamic surface).

## Admin Theme Editor updates
- Add a "Surface" (or "Card background") ColorPicker bound to `--color-surface` for Light and Dark bases.
- Do not expose `--color-surface-static`—it remains constant white by design.
- Ensure the preview swatches and saved base palettes include `surface` so ThemeManager can propagate it.

## Text/readability guidance
- Ensure card content uses `var(--color-text-main)`/`var(--color-text-secondary)` for titles/body copy instead of inherited black/gray classes.
- For actionable elements (buttons, links) on tinted/dark surfaces, rely on `--color-primary`/`--color-secondary` plus `--color-border` for separators to keep contrast acceptable.
- If a user sets a dark/tinted surface in Light mode, the text variables still provide legible contrast because they come from the base palette, not the surface color.

## Rollout checklist
- Update shared card components/utilities to default to `bg-[var(--color-surface)]`.
- Touch feature-specific cards (reservations, tasks, knowledge, payroll) to remove hardcoded whites.
- Keep Beosztas-specific containers using the static surface variable.
- Verify ThemeManager includes both surface variables in its managed set and that AdminThemeEditor saves/loads the `surface` property.
