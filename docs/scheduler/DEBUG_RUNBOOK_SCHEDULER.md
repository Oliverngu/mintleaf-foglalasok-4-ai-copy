# DEBUG RUNBOOK — Beosztáskészítő

## 0) Gyors triázs
1. Melyik layer hibázik? (UI állapot / Firestore rules / callable).
2. Reprodukálható-e adott user+unit kombinációval?
3. Draft vs published mode ugyanazt mutatja?

## 1) Permission denied diagnózis

## Ellenőrizd a user role + unit kapcsolatot
- `users/{uid}` dokumentumban `role`, `unitIds` helyes-e.
- Dashboard `hasPermission('canManageSchedules')` igaz-e a kiválasztott unitra.

## Ellenőrizd a shift dokumentummezőket
- `shifts/{id}` tartalmaz-e `unitId` mezőt.
- `unitId` ténylegesen benne van-e a user `unitIds` listájában.
- `status`, `start`, `userId` konzisztens-e.

## Ellenőrizd query típust (`LIST` vs `GET`) főleg users esetén
- `BeosztasApp` users listener egy collection LIST; rules deny esetén fallback staff map aktiválódik.
- Shift listener App szinten külön fut; lehet, hogy users deny mellett shifts még olvasható.

## 2) Tipikus query hibák
- `where('unitId', 'in', unitIds)` hibák:
  - unitIds üres/túl nagy/inkonzisztens.
  - rules szerint nem látható valamely unit.
- „query requires an index”:
  - App `firestoreError` jelzi, hogy index épül.
  - Repo `firestore.indexes.json` jelenleg üres, custom index nincs verzionálva.

## 3) Timezone / week boundary edge case-ek

## ISO hét vs locale hét
- Scheduler hétkezdete explicit hétfő (`startOfWeekMonday`), nem locale default.
- Ha riport/teszt vasárnap-kezdettel számol, eltérés lesz.

## DST (nyári/téli óraátállás)
- Shift duration számítás Date diff-re épül.
- Óraátállás heteiben +1/-1 óra anomália előfordulhat, ha üzleti szabály nem kezeli külön.

## Éjfélt átlógó műszak
- `calculateShiftDuration` closingTime fallbacknél ha end < start, másnapra léptet.
- Ellenőrizd `closingOffsetMinutes` és dayKey/start alignmentet.

## 4) Publish hibák
1. Ellenőrizd, hogy draft státuszú shift van-e a hét intervallumában.
2. Batch commit hibánál nézd:
   - rules (write jogosultság),
   - shift doc unitId,
   - doc id érvényesség.
3. Email nem ment ki:
   - callable sikerült-e,
   - functions logban payload validáció,
   - `email_queue` doc létrejött-e.

## 5) Export hibák
- PNG:
  - `html2canvas` exception -> console stack + DOM méret.
  - CORS/font load probléma.
- Excel:
  - globális `XLSX` elérhető-e (`index.html` script).
  - adatsorban undefined/rossz shape.

## 6) Where to log / what to inspect checklist

## Browser console
- `[BeosztasApp] users collection listener denied...`
- `Error publishing shifts`
- `PNG export failed`
- `Excel export failed`
- `Failed to persist default settings` / `Failed to save settings`

## Firestore dokumentumok
- `shifts/*` (unitId, status, start/end)
- `schedule_settings/{unit_week}`
- `schedule_display_settings/{units_join}`
- `unit_export_settings/{unitId}`

## Functions
- `enqueueQueuedEmail` callable response.
- `functions/src/index.ts` validációs ág (`schedule_published`).
- `email_queue/*` pending/sent/error státusz.

## 7) Issue report template (repro)
- **User UID + role**:
- **Aktív unitId(k)**:
- **View mode**: draft/published
- **Week range**:
- **Lépések**:
- **Elvárt eredmény**:
- **Tényleges eredmény**:
- **Console log snippet**:
- **Érintett Firestore doc pathok**:
- **Képernyőkép / export fájl**:
