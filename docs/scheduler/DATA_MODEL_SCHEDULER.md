# DATA MODEL — Beosztáskészítő

## Type model (frontend)

## `Shift`
Forrás: `src/core/models/data.ts`
- `id: string`
- `userId: string`
- `userName: string`
- `unitId?: string`
- `position: string`
- `start?: Timestamp | null`
- `end?: Timestamp | null`
- `note?: string`
- `status: 'draft' | 'published'`
- `isDayOff?: boolean`
- `isHighlighted?: boolean`
- `dayKey?: string`

## `ScheduleSettings`
- `id` = `${unitId}_${weekStartDate}`
- `unitId: string`
- `weekStartDate: string (YYYY-MM-DD)`
- `showOpeningTime: boolean`
- `showClosingTime: boolean`
- `dailySettings[0..6]`: `DailySetting`

## `DailySetting`
- `isOpen: boolean`
- `openingTime: string`
- `closingTime: string`
- `closingOffsetMinutes?: number`
- `quotas: { [position: string]: number }`

## `ExportStyleSettings`
- unit-szintű export megjelenés (zebra/grid/fonts/header/day naming).
- `id` mező unitId szerepben használt.

## Firestore path inventory (scheduler)

## Közvetlenül scheduler által olvasott/írt
- `shifts/{shiftId}` — shift CRUD + publish status update.
- `schedule_settings/{unitId}_{weekStartDate}` — heti nyitás/zárás + quota config.
- `schedule_display_settings/{sortedUnitIdsJoined}` — felhasználói sorrend/rejtés állapot.
- `unit_export_settings/{unitId}` — export stílus beállítások.

## Scheduler UI-ban olvasott kiegészítő források
- `users/{userId}` — staff directory (fő forrás).
- `positions/{positionId}` — pozíciólista rendezéshez/jelöléshez.
- `requests/{requestId}` — szabadság/availability overlay a cellákban (propként érkezik, App szinten töltve).

## Kapcsolódó, de scheduleren kívüli path (runbookhoz releváns)
- `user_private_data/{userId}` — nem scheduler feature write-path, de auth/rules diagnózisnál releváns.

## Invariánsok (kódból/rulesből)
1. `status` implicit defaultként több helyen `draft`-ként kezelődik, ha hiányzik.
2. Publish csak draft műszakokra fut (`status === 'draft' || !status`).
3. `unitId` kritikus:
   - rules szerint shifts read/write unit-hez kötött,
   - hiányzó `unitId` műszak gyakran láthatatlan non-adminnak.
4. `schedule_settings` doc ID kompozit kulcs (`unitId_weekStartDate`).
5. `schedule_settings` íráskor `request.resource.data.unitId != null` elvárt rules alapján.
6. Display settings doc ID több unit nézetnél rendezett unitId join (`a_b_c`).
7. Export settings mentés csak single-unit nézetben engedett UI oldalon.
8. Selection/bulk műveletek single-unit fókuszúak (`activeUnitIds.length === 1` guard több helyen).

## Index igények
- Repo `firestore.indexes.json` üres (`indexes: []`).
- Scheduler kód `shifts` query tipikusan `where('unitId', 'in', unitIds)`; explicit index definíció repo-ban nincs.
- App-level hibakezelés index build állapotra explicit üzenetet ad (általános Firestore listener handler).

## „Nem találtuk” jelentés (kötelező)
Keresve volt (`rg`): `unit_staff`, `schedule assistant`, `suggestion`, `violation`, `constraint`.
- Scheduler feature-ben **nem található** `unit_staff` collection használat.
- Constraint/violation/suggestion pipeline schedulerhez kötve **nem található**; ilyen logika reservations modulban van.
