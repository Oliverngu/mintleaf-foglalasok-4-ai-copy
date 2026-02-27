# CHANGE RISK HOTSPOTS — Beosztáskészítő

Prioritás: **P0** (magas), **P1** (közepes).

## P0 — Shift write pipeline (`BeosztasKeszitoApp.tsx`)
**Miért veszélyes?**
- Ugyanazon komponens kezeli single edit, bulk edit, highlight/day-off, delete és publish átmeneteket.
- `unitId`, `status`, `dayKey`, `start/end` kombinációk könnyen inkonzisztensek lehetnek.

**Milyen teszt védje?**
- Unit teszt: selection -> expected Firestore write payload shape.
- Integrációs teszt: create/update/delete + viewMode filter regresszió.
- Edge teszt: highlight-only shift ne törje a normál shift választást.

**Milyen log/metric kéne?**
- Write success/failure counter action típusonként.
- Invalid dayKey / skipped cell szám logolása (deven túl is samplinggel).

## P0 — Publish batch + notification coupling
**Miért veszélyes?**
- Batch commit és email queue hívás egymás után fut; publish siker + email fail eset külön kezelendő.
- Recipients számítás users snapshot minőségétől függ.

**Milyen teszt védje?**
- Publish flow teszt: draft->published minden kiválasztott unitnál.
- Contract teszt callable payloadra (`schedule_published` whitelist).

**Milyen log/metric kéne?**
- `published_shift_count`, `publish_unit_count`, `publish_email_enqueued`.
- Callable error code bontás.

## P0 — Firestore rules + unitId invariáns
**Miért veszélyes?**
- `shifts` olvashatóság unitId-től és role-tól függ; hiányos unitId adat „eltűnt shift” hibát okoz.

**Milyen teszt védje?**
- Rules teszt: non-admin read/create/update unit boundary.
- Data migration guard: unitId null shift detektálás.

**Milyen log/metric kéne?**
- Scheduled audit: unitId missing shifts count.

## P1 — Staff directory fallback (users denied)
**Miért veszélyes?**
- Fallback csak shiftből derivál, így hiányos metadata (email, valós név) lehet.

**Milyen teszt védje?**
- Már van unit teszt a fallbackre; bővíteni unknown/empty name esetekre.

**Milyen log/metric kéne?**
- users denied esemény számláló per role/unit.

## P1 — Export mapping (PNG + Excel)
**Miért veszélyes?**
- Erősen DOM/stílusfüggő PNG ág, illetve külön logikájú Excel transzform.
- Export settings változás könnyen vizuális regressziót okoz.

**Milyen teszt védje?**
- Snapshot jellegű export smoke teszt (legalább workbook shape / kulcs cellák).
- E2E: PNG export gomb smoke (fájl létrejön).

**Milyen log/metric kéne?**
- export_success/export_fail bontva PNG/Excel szerint.

## P1 — Week/time számítás
**Miért veszélyes?**
- Hétfő alapú week boundary + local Date kezelés DST környékén hibás óraszámot adhat.

**Milyen teszt védje?**
- DST hétre duration tesztek.
- Month view week block generálás teszt hónap-határ esetekre.

**Milyen log/metric kéne?**
- Duration outlier (negatív / túl nagy) figyelmeztetés.

## Regresszió teszt ajánlások (minimum csomag)
1. `scheduleStaffDirectory` fallback tesztek bővítése (unit mismatch + unknown name).
2. Publish flow integration (draft filter + batch update payload).
3. Settings load/create default (`schedule_settings` missing doc branch).
4. Export smoke (Excel generate hívás minimális fixture-rel).
5. Rules tests: shifts + schedule_settings + unit_export_settings permission matrix.
