# Reservation/Allocation Invariants

These invariants describe behaviors and data-shape expectations that must remain stable for
reservations and allocation flows. When debugging, validate these first.

## Core invariants
1. **Allocation finalization is authoritative.** `allocationFinal` and `allocationFinalComputedAt` are
   written by `guestCreateReservation` and by admin override actions; no other code path should
   mutate them. `allocationOverride` is the only admin input used to lock/unlock allocation finalization.
2. **Allocation traceability is required.** Allocation decisions include `allocationTraceId` (and
   `allocation.traceId`), and audit logs are keyed by `{unitId}_{dateKey}_{traceId}` for deterministic
   lookup.
3. **Allocation decisions must be accepted to mutate capacity.** If `decideAllocation` returns a
   non-accepted decision, no reservation is created/modified and capacity is not incremented.
4. **Capacity ledgers must stay consistent.** For accepted decisions, `capacityLedger` fields on
   reservations and capacity documents must reflect the computed `headcount` delta and the
   decision’s `capacityKey`.
5. **Allocation intent is normalized.** `allocationIntent.timeSlot`, `zoneId`, and `tableGroup` are
   normalized to `null` when not present, and used to update breakdown counters (`byTimeSlot`,
   `byZone`, `byTableGroup`) only when a field is set.
6. **Allocation diagnostics is best-effort only.** Diagnostics are recorded when seating context is
   available; missing zones/tables must not block reservation creation/modification.
7. **Allocation log writes are best-effort.** Failure to write allocation audit logs must not fail the
   reservation flow; errors are logged but the reservation response is still returned when the
   decision is accepted.
8. **Allocation overrides are stored per unit.** Overrides live in the `allocation_overrides` collection
   under a unit and are loaded transactionally before a decision is made.
9. **Allocation strategy/mode are explicit.** `allocationMode` and `allocationStrategy` are normalized
   to known values (`capacity`, `floorplan`, `hybrid` and `bestFit`, `minWaste`, `priorityZoneFirst`)
   and are stored on allocation logs/records for traceability.
10. **Reservation mutations are traceable.** Each reservation mutation includes a mutation trace id
    (e.g. `guest-modify-...`) to correlate with allocation audit logs.
11. **Capacity breakdowns are updated deterministically.** `byTimeSlot`, `byZone`, and `byTableGroup`
    counters update only for the fields provided by `allocationIntent` and use `headcount` as the
    increment/decrement value.
12. **Allocation record persistence is optional.** `allocated` records are only written when allocation
    is enabled and a decision was accepted.

## Local regression gate (no CI configured)
Run the single command below to execute unit tests and the reservation smoke test in sequence:

```bash
npm --prefix functions run gate:reservations
```

Ensure the Firestore/Functions emulators are running and `FIRESTORE_EMULATOR_HOST` is set
before running the smoke test. See `functions/SMOKE.md` for details.
