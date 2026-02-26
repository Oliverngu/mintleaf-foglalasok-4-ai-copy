# Schedule (Beosztás) debug checklist

## Current dataflow (Beosztás nézet)
1. **Shifts source**: `App.tsx` subscribes to `shifts`.
   - Non-admin: `query(collection(db, 'shifts'), where('unitId', 'in', currentUser.unitIds.slice(0, 10)))`
   - Admin: full `collection(db, 'shifts')`.
2. **Staff directory source**: `BeosztasKeszitoApp.tsx` first tries `users` collection listener.
   - If this is denied for non-admin, the app now falls back to a **shift-derived staff map** (`userId`, `userName`, `position` from visible shifts).
3. **Merge point**: the schedule grid uses `orderedUsers` + `activeShifts` (`shiftsByUserDay`) to render rows and daily cells.

## Permission denied triage
- Browser console: look for `Missing or insufficient permissions` and note collection path:
  - `users` list read denied is expected for non-admin with current rules.
  - `shifts` denied usually indicates unit mismatch or malformed `unitId`.
- Network tab (Firestore): confirm which listener/query fails first (`users` vs `shifts`).

## Firestore field sanity checks for invisible shifts
- Verify each affected shift doc has:
  - `unitId` present
  - `unitId` type is string
  - `unitId` belongs to current user's `unitIds`
- Verify query filters are not accidentally constrained to `userId == auth.uid` for the unit schedule view.

## Rules sanity checks
- `users/{userId}` read is currently `isSelf(userId) || isAdmin()`.
  - Consequence: non-admin cannot list all users.
- `shifts/{shiftId}` read requires `resource.data.unitId != null && hasUnit(resource.data.unitId)` for non-admin.
  - Consequence: shifts missing `unitId` are hidden.

## Quick reproduction recipe
1. Login with non-admin user assigned to a unit with multiple workers.
2. Open Beosztás for a week where colleagues have shifts.
3. Confirm colleague rows still render when `users` list read is denied (fallback path).
4. Repeat as admin and compare counts.
