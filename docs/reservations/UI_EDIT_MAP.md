# UI Edit Map — Reservations & Seating

## Change guest booking UI
- `src/ui/components/public/ReservationPage.tsx`
- `src/ui/components/public/PublicReservationLayout.tsx`

## Change manage flow UI
- `src/ui/components/public/ManageReservationPage.tsx`
- `src/ui/components/public/PublicReservationLayout.tsx`

## Change seating settings panel UI
- `src/ui/components/apps/SeatingSettingsModal.tsx`
- Entry point button in `src/ui/components/apps/FoglalasokApp.tsx`

## Change floorplan viewer UI
- `src/ui/components/apps/seating/FloorplanViewer.tsx`

## Change admin booking UI (list + details)
- `src/ui/components/apps/FoglalasokApp.tsx`
- Related booking modals embedded in `FoglalasokApp.tsx`

## Change reservation settings UI (not seating)
- `src/ui/components/apps/ReservationSettingsModal.tsx`
- `src/ui/components/apps/ReservationSettingsForm.tsx`

## Change allocation backend (read-only for current task)
- `functions/src/index.ts`
- `functions/src/allocation/*`
- `functions/src/reservations/allocationEngine.ts`
- `functions/src/reservations/allocationOverrideService.ts`
- `functions/src/reservations/allocationLogService.ts`
- `functions/src/reservations/capacityLedgerService.ts`
- `src/core/services/seatingAdminService.ts`
- `src/core/services/seatingService.ts`

