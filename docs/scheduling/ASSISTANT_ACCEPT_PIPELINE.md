# Assistant Accept/Reject Pipeline

## Overview
This pipeline persists assistant suggestion decisions and applies shift changes atomically.

**Flow (accept)**
1. Load latest shifts for the unit.
2. Check the applied-ledger by `suggestionId` inside a transaction.
3. Run `applySuggestion` on the snapshot.
4. If `applied`:
   - Write shift updates/creates in the same transaction.
   - Write `assistantApplied/{suggestionId}` ledger.
   - Write `assistantDecisions/{suggestionId}` decision record.
5. If `noop`:
   - Still write `assistantDecisions/{suggestionId}`.
6. If `failed`:
   - Do not write shift changes.
   - Log failure in `assistantApplyFailures`.

**Flow (reject)**
1. Write `assistantDecisions/{suggestionId}` with `decision=rejected`.

## Collections
All assistant metadata is stored under the unit:
- `units/{unitId}/assistantApplied/{suggestionId}`
- `units/{unitId}/assistantDecisions/{suggestionId}`
- `units/{unitId}/assistantApplyFailures/{autoId}`

Shifts remain in the existing root collection:
- `shifts/{shiftId}`

## Error Codes
The apply pipeline exposes the following codes:
- `missing_fields`
- `invalid_fields`
- `invalid_time_format`
- `invalid_time_range`
- `duplicate_shift`
- `shift_not_found`
- `unsupported_action`
- `apply_failed`
- `user_mismatch`

## Idempotency
- If `assistantApplied/{suggestionId}` exists, the accept path returns `noop` with `alreadyApplied=true`.
- If `applySuggestion` returns no effects, the accept path returns `noop` and still records a decision.

## Service Functions
Located in: `src/core/scheduling/assistant/services/assistantDecisionService.ts`
- `acceptSuggestion(request)`
- `rejectSuggestion(request)`
