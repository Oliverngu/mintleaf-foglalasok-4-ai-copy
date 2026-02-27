# SYSTEM OVERVIEW — Beosztáskészítő

## Part 1 — Scope + Analysis Plan (read-only summary)

### Mi tartozik a „Beosztáskészítő app” scope-ba
- **UI feature**: `BeosztasApp` (`src/ui/components/apps/BeosztasKeszitoApp.tsx`) + dashboard entry (`src/ui/components/Dashboard.tsx`).
- **Adatforrások**: `shifts`, `users`, `positions`, `schedule_settings`, `schedule_display_settings`, `unit_export_settings` Firestore kollekciók/dokumentumok.
- **Domain**: műszak (`Shift`), heti beállítás (`ScheduleSettings`), export stílus (`ExportStyleSettings`), publikálás (`draft -> published`).
- **Kapcsolódó integrációk**: email queue callable (`enqueueQueuedEmail`) a „schedule_published” típushoz.

### Mi **nem** tartozik ide (repo alapján)
- Foglalás allokációs assistant/suggestion/constraint engine nem a scheduler feature része (külön reservations modulokban található).
- Nincs külön scheduler-specifikus Cloud Function trigger a publikálásra; kliens batch update + általános email queue callable fut.

### Feltérképezési terv
1. Entrypoint + app navigáció feltérképezése (`App.tsx`, `Dashboard.tsx`, `HomeDashboard.tsx`).
2. Scheduler fő konténer + helper modulok áttekintése (`BeosztasKeszitoApp.tsx`, `ExportModal.tsx`, `scheduleStaffDirectory.ts`).
3. Firestore model + rules ellenőrzése (`data.ts`, `firestore.rules`, `firestore.indexes.json`).
4. Functions/email kapcsolat ellenőrzése (`emailQueueService.ts`, `functions/src/index.ts`).
5. Tesztek + edge case-ek + debug checklista összegzése.

## Part 2 — 1-oldalas architektúra

## Bounded context (scheduler)

**Inside**
- Heti/multiheti műszaknézet és szerkesztés.
- Staff megjelenítés + fallback users denied esetén.
- Draft/published nézetváltás és heti publikálás.
- Beosztás-specifikus display/opening/export beállítások.
- PNG/Excel export.

**Outside**
- Reservation seat-allocation suggestion engine.
- Általános admin jogosultság- és unit-kezelés (csak bemenetként fogyasztja).

## Textual architecture diagram

1. **UI layer**
   - `App.tsx` hozza a `shifts` listát Firestore-ból és átadja dashboardnak.
   - `Dashboard.tsx` `activeApp === 'beosztas'` esetén rendereli a `BeosztasApp` komponenst.
   - `HomeDashboard.tsx` „Beosztásom megtekintése” gombbal navigál a scheduler appra.

2. **Feature layer (`BeosztasApp`)**
   - Week/day számítás, filtered users, ordered/hidden state, selection mód.
   - Shift CRUD, bulk edit, publish, export action-ök.
   - Display/settings snapshot listener-ek és mentések.

3. **Service/helper layer**
   - `scheduleStaffDirectory.ts`: users-list denied fallback staff építés a látható shift-ekből.
   - `ExportModal.tsx`: Excel generálás (SheetJS globális `XLSX`).
   - `emailQueueService.ts`: `enqueueQueuedEmail` callable wrapper.

4. **Persistence**
   - Firestore dokumentumok: `shifts/*`, `schedule_settings/*`, `schedule_display_settings/*`, `unit_export_settings/*`.
   - `users/*`, `positions/*` olvasás a scheduler UI-hoz.

5. **Backend/function kapcsolat**
   - Kliens publish során queue-z emailt `enqueueQueuedEmail(type='schedule_published')` callable-en át.
   - Functions oldalon payload/role/unit validáció után `email_queue` írás történik.

## Auth / role gating pontok
- **Kliens oldali gating**:
  - Dashboard `canManageSchedules` alapján adja a `canManage` propot.
  - `BeosztasApp` több író műveletnél `canManage` + `activeUnitIds.length === 1` feltételt vár.
- **Firestore rules**:
  - `shifts`: read -> unit membership, write -> admin/unit admin/unit leader és érvényes unit.
  - `schedule_settings`: read/write unit-hez kötötten, `unitId` kötelező írásnál.
  - `unit_export_settings`: read `canViewUnit`, write `canManageUnit`.
  - `schedule_display_settings`: read/write bármely signed-in user.
- **Callable oldali gating**:
  - `enqueueQueuedEmail` csak auth userrel hívható.
  - `schedule_published` payload whitelist + unit manage jogosultság ellenőrzés után queue-ba kerül.

## Part 1 ToC (készülő handover csomag)
1. `SYSTEM_OVERVIEW_SCHEDULER.md`
2. `FILE_MAP_SCHEDULER.md`
3. `DATA_MODEL_SCHEDULER.md`
4. `DATAFLOWS_SCHEDULER.md`
5. `DEBUG_RUNBOOK_SCHEDULER.md`
6. `CHANGE_RISK_HOTSPOTS_SCHEDULER.md`
