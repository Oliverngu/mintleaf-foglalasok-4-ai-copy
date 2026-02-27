# FILE MAP — Beosztáskészítő (canonical)

## Core UI (pages/containers)
- `App.tsx` — top-level Firestore listener (`shifts`) + dashboard state container.
- `src/ui/components/Dashboard.tsx` — app-váltás, permission gate, `BeosztasApp` mount.
- `src/ui/components/HomeDashboard.tsx` — dashboard widget/gomb link a `beosztas` apphoz.
- `src/ui/components/apps/BeosztasKeszitoApp.tsx` — scheduler fő konténer (state, actions, CRUD, publish, export).

## Widgets / components (scheduleren belül)
- `src/ui/components/apps/BeosztasKeszitoApp.tsx` (belső komponensek)
  - `ShiftModal` — egy cella/shift szerkesztés.
  - `PublishScheduleModal` — unit-szintű draft publish kiválasztás.
  - `ExportConfirmationModal` — PNG/Excel export megerősítés.
  - `HiddenUsersModal`, `BulkTimeModal` — display/bulk szerkesztési UI.

## Hooks / state patterns
- `BeosztasKeszitoApp.tsx` — React local state + `useMemo` derived maps (`shiftsByUserDay`, `requestsByUserDay`, `workHours`).
- `src/ui/context/UnitContext` (fogyasztva Dashboardban) — aktív unit(ok) kiválasztása; scheduler szűrések alapja.
- `Dashboard.tsx` `hasPermission` — role+unit permission feloldás.

## Services
- `src/core/services/emailQueueService.ts` — callable wrapper `enqueueQueuedEmail`.
- `src/core/firebase/config.ts` — Firestore + Functions kliens inicializáció.

## Domain / engine
- `src/core/models/data.ts`
  - `Shift`, `ScheduleSettings`, `DailySetting`, `ExportStyleSettings` típusok.
- `src/ui/components/apps/scheduleStaffDirectory.ts`
  - users denied fallback: shiftből derivált munkatárslista.
- `src/ui/components/apps/BeosztasKeszitoApp.tsx`
  - date/week helper-ek, selection engine, bulk update logika.

## Exports
- `src/ui/components/apps/ExportModal.tsx` — Excel export builder (SheetJS).
- `src/ui/components/apps/BeosztasKeszitoApp.tsx` — PNG export (`html2canvas`) + fájlnév képzés.
- `index.html` — SheetJS CDN script (`xlsx.full.min.js`) betöltés.

## Infra / policy
- `firestore.rules` — shifts/settings/export settings/security szabályok.
- `firestore.indexes.json` — jelenleg nincs explicit index deklaráció.
- `functions/src/index.ts` — `enqueueQueuedEmail` callable + `schedule_published` template validáció.

## Tests / fixtures
- `src/ui/components/apps/scheduleStaffDirectory.test.ts` — fallback directory unit tesztek.
- `docs/schedule-debug-checklist.md` — korábbi operatív scheduler debug jegyzet.

## Keresett, de scheduler scope-ban nem talált modulok
- `unit_staff` — nincs explicit használat scheduler kódban.
- scheduler assistant/suggestion/violation/constraint pipeline — nincs külön scheduler modul; ezek reservation domainben jelennek meg.
