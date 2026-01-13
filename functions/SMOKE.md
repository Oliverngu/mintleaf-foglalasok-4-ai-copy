# Reservation Smoke Test (Emulator)

This smoke test runs against the Firebase emulators and validates:
- capacity totals (`count` / `totalCount`)
- breakdown fields (byTimeSlot/byZone/byTableGroup when present)
- capacityLedger fields on reservations
- allocation log writes (best-effort)

## Terminal A (start emulators)
```bash
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
firebase emulators:start --only firestore,functions --project demo-mintleaf
```

## Terminal B (run smoke test)
```bash
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
npm --prefix functions run smoke:reservations:buildrun
```

Notes:
- The script fails fast if `FIRESTORE_EMULATOR_HOST` is not set.
- You can override the Functions emulator host with `FUNCTIONS_EMULATOR_HOST`.
- Project id can be set via `PROJECT_ID`, `FIREBASE_PROJECT_ID`, or `GCLOUD_PROJECT`.
- The script selects a start time two hours in the future and clamps it into the `bookableWindow`.
