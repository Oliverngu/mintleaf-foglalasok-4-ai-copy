# DATAFLOWS — Beosztáskészítő

Formátum: `Actor -> UI -> Service/Helper -> Firestore/Functions -> UI`.

## 1) Week load (alap heti nézet)
1. User megnyitja Beosztás appot.
2. `Dashboard` átadja `schedule` és `requests` propokat a `BeosztasApp`-nak.
3. `BeosztasApp` week helper-ekkel kiszámolja a hétfő-alapú blokkot (`startOfWeekMonday`, `weekDays`).
4. `schedule` lista szűrés: `status == viewMode`, `unitId in activeUnitIds`, plusz „van tartalom”.
5. UI `shiftsByUserDay` map-ből renderel.

Failure modes:
- Üres nézet, ha rossz `viewMode` + minden shift más státuszban.
- Hiányzó `unitId` shift kieshet non-admin láthatóságból.

Observability:
- Dev env debug log: highlight-only shift figyelmeztetés.
- Firestore listener hibák App szinten (`firestoreError`).

## 2) Staff directory betöltés + fallback
1. `BeosztasApp` `onSnapshot(collection('users'))`-t indít.
2. Siker esetén users lista -> unit szerinti filter.
3. Hiba (permission denied) esetén `isUsersDirectoryDenied=true`.
4. Fallback: `buildScheduleStaffDirectory(schedule, activeUnitIds)` shift alapú user lista.
5. `resolveVisibleStaffForSchedule` választ a users vs fallback között.

Failure modes:
- users denied + rossz minőségű shift adatok (`userName` hiány) -> „Unknown employee” label.

Observability:
- `console.warn` dedikált üzenet users listener denied esetre.

## 3) Shift create/update/delete
1. User cell/modal műveletet indít.
2. `handleSaveShift`:
   - update ág: `updateDoc(shifts/{id})`
   - create ág: `addDoc(shifts)`
3. `handleDeleteShift` -> `deleteDoc(shifts/{id})` confirm után.
4. App-level `shifts` listener miatt UI automatikusan frissül.

Failure modes:
- Active unit hiányos -> rossz `unitId` mentés kockázat.
- Rules deny: unit membership/role mismatch.

Observability:
- Hibák `console.error` és alert üzenetekben.

## 4) Publish / unpublish-szerű flow (draft -> published)
1. Draft nézetben `Hét publikálása`.
2. `handlePublishWeek` összegyűjti heti draft shift-eket és unitonként csoportosít.
3. User kiválaszt unit(oka)t a modalban.
4. `handleConfirmPublish` batch update-tel `status='published'`-ra állít.
5. Opcionális email queue: `enqueueQueuedEmail('schedule_published', unitId, payload)`.

Failure modes:
- Nincs draft -> rövid megszakítás.
- Batch commit hiba -> publish részben sem történik (atomic batch).
- Email queue hiba -> status már published lehet, notify kieshet.

Observability:
- `console.error('Error publishing shifts')`.
- Queue callable validáció és functions logok.

## 5) Settings load/save (heti nyitás-zárás)
1. Single unit + manage jog esetén scheduler figyeli `schedule_settings/{unit_week}` docot.
2. Ha nincs doc: default settings generálás + `setDoc` persist kísérlet.
3. UI módosításkor `handleSettingsChange` local update + `setDoc` write.

Failure modes:
- Multi-unit view: manager settings panel funkciók részben tiltottak.
- Missing unitId settings docban -> runtime korrekció történik, de adatminőségi jel.

Observability:
- Persist/save error console logok.

## 6) Display settings load/save (reorder/hide)
1. `settingsDocId = sorted(activeUnitIds).join('_')`.
2. Snapshot `schedule_display_settings/{settingsDocId}`.
3. `orderedUserIds` + `hiddenUserIds` alapján render-sorrend.
4. Mozgatás/rejtés műveletek `saveDisplaySettings`-en keresztül `setDoc(..., merge:true)`.

Failure modes:
- Unit list sorrend változás nélkül nincs; de unit készlet változás más docId-t ad.

Observability:
- Save hiba explicit console error.

## 7) Export generálás (PNG)
1. User export modalban PNG-t választ.
2. `handlePngExport` export render mód + layout wait.
3. DOM klón/testreszabás -> `html2canvas`.
4. `canvas.toDataURL` + link click -> letöltés.

Failure modes:
- Font/CORS/layout probléma torz export.
- Nagy DOM -> memória/idő limit.

Observability:
- `console.error('PNG export failed')`.

## 8) Export generálás (Excel)
1. User export modalban Excel-t választ.
2. `generateExcelExport` (SheetJS) adatsorok + stílus + merge + oszlopszélesség.
3. Workbook write + letöltés.

Failure modes:
- Hiányzó globális `XLSX` (index script betöltési probléma).
- Inkonzisztens adatszerkezet esetén export exception.

Observability:
- try/catch körben `console.error('Excel export failed')` + alert.

## 9) App-level shifts load (upstream flow)
1. `App.tsx` autentikáció után shifts listener-t indít (`collection('shifts')` vagy `where unitId in ...`).
2. Snapshot állapotot ad át `Dashboard`/`BeosztasApp` felé.

Failure modes:
- `in` query és nagy unit lista / rules deny / index problémák.

Observability:
- App `firestoreErrorHandler` index-build és query error üzenetekhez.
