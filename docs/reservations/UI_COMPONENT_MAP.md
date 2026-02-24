# UI Component Map — Reservation + Seating / Allocation

> Scope: This document covers **only** the UI components listed in the UI Edit Map and describes their current behavior and data flow. It is strictly descriptive.

---

## ReservationPage (`src/ui/components/public/ReservationPage.tsx`)

### Purpose
- Guest-facing booking flow (multi-step form) for creating a new reservation.
- Role: **guest**.

### Inputs
- **Props:** `unitId`.
- **Firestore reads:**
  - `reservation_settings/{unitId}` for booking settings, theme, guest form config.
  - `units/{unitId}/reservation_capacity` for daily headcount + capacity data shown in calendar.
- **Function endpoints:**
  - `POST /guestCreateReservation` (Cloud Functions) to submit bookings.

### State & Data Flow
- Internal state includes: step progression (`step`), selected date, form data, settings/theme, submission state, errors, `capacityByDate` map, `dailyHeadcounts` map.
- **Allocation data flow (read-only on this page):**
  - The guest selects `preferredTimeSlot` and `seatingPreference`; these are attached to the reservation payload as `preferredTimeSlot` + `seatingPreference` and stored in `customData`.
  - Allocation diagnostics and final allocation are not computed on the client; they are computed server-side.
- **Write points:**
  - Writes only via `guestCreateReservation` endpoint, which in turn writes reservation + allocation fields server-side.

### User Interactions
- Select date/time, fill guest details, and submit the booking.
- Submit triggers network call to `guestCreateReservation`.
- UI feedback: loading spinner for settings, submission state machine (`idle|submitting|success|error`), error banners via `normalizeSubmitError`.

### Dependencies
- Theme system: `reservationTheme` + `PublicReservationLayout`.
- Utilities: `normalizeSubmitError`, `getOnlineStatus`, `timeSlot` formatting.
- Firestore client and Cloud Functions base URL.

### Observed UX Issues (descriptive)
- Multi-step flow with several required inputs; error handling is centralized and may produce technical error messages.
- Booking capacity data is presented in calendar context; visibility of why a date is unavailable depends on capacity data.

---

## PublicReservationLayout (`src/ui/components/public/PublicReservationLayout.tsx`)

### Purpose
- Shared layout shell for public reservation pages, providing themed background, card framing, and optional decorations.
- Role: **guest**.

### Inputs
- **Props:** `theme`, `header`, `body`, `footer`, `topRightContent`, `watermarkText`, `decorations`, `isMinimalGlassTheme`.
- **Firestore/Endpoints:** none.

### State & Data Flow
- Stateless component that renders UI based on props.
- No allocation data handled.

### User Interactions
- No direct interactions beyond scrolling; handles layout and container visuals.

### Dependencies
- Theme tokens from `reservationTheme`.
- `GlassOverlay` for minimal glass rendering.

### Observed UX Issues (descriptive)
- None in logic; component is purely presentational and tightly coupled to the theme token structure.

---

## ManageReservationPage (`src/ui/components/public/ManageReservationPage.tsx`)

### Purpose
- Guest-facing manage page for **cancel** and **modify** actions; also supports admin approve/reject via email token.
- Role: **guest**, **admin (email token)**.

### Inputs
- **Props:** `unitId`, `reservationId`, `manageToken`.
- **Firestore reads:**
  - `reservation_settings/{unitId}` for theme and settings.
- **Function endpoints:**
  - `POST /guestGetReservation` to fetch booking details.
  - `POST /guestUpdateReservation` for cancellation.
  - `POST /guestModifyReservation` for time/headcount modifications.
  - `POST /adminHandleReservationAction` for approve/reject from admin email tokens.

### State & Data Flow
- Internal state includes booking info, settings/theme, admin token hashing, modify form state, cancellation state, and error/success messaging.
- **Allocation data flow (read-only in this UI):**
  - Does not read or write allocation fields directly; relies on backend response (e.g., updated times/headcount) after modify.
- **Write points:**
  - All writes go through the four function endpoints listed above.

### User Interactions
- Guest can cancel reservation (modal) or modify time/headcount.
- Admin can approve/reject (auto-triggered if admin token present in URL query params).
- UI feedback: loading spinner, error messaging, success banner text, and form-level errors.

### Dependencies
- Theme system: `reservationTheme`, `PublicReservationLayout`.
- Token hashing via Web Crypto API; `logTokenPresence` helper.
- Error normalization via `normalizeSubmitError`.

### Observed UX Issues (descriptive)
- Multiple action types (cancel/modify/admin approve/reject) coexist in a single screen, increasing cognitive load.
- Admin actions auto-trigger when tokens are present; users may experience immediate state changes without confirmation.

---

## SeatingSettingsModal (`src/ui/components/apps/SeatingSettingsModal.tsx`)

### Purpose
- Admin-facing **seating configuration** UI: zones, tables, combinations, floorplans, allocation settings.
- Role: **admin / unit admin**.

### Inputs
- **Props:** `unitId`, `onClose`.
- **Firestore data paths (via services):**
  - `units/{unitId}/seating_settings/default` (read/write).
  - `units/{unitId}/zones` (read/write).
  - `units/{unitId}/tables` (read/write).
  - `units/{unitId}/table_combinations` (read/write).
  - `units/{unitId}/floorplans` (read/write via services).
- **Function endpoints:**
  - `logAllocationEvent` (debug, callable function in dev).

### State & Data Flow
- Local state for: settings, zones, tables, combos, floorplans, and extensive edit state (dragging, forms, active selections).
- **Allocation data flow:**
  - Edits to `seating_settings` influence allocation decisions on backend (`allocationEnabled`, strategy, etc.).
  - UI writes these settings via service calls; no direct allocation decisions computed here.
- **Write points:**
  - `updateSeatingSettings`, `create/update/delete` for zones/tables/combos/floorplans.

### User Interactions
- CRUD operations for zones/tables/combinations/floorplans.
- Toggle/adjust allocation configuration.
- Debug logging via callable (dev-only).
- UI feedback: loading state, inline success/error messages.

### Dependencies
- `seatingAdminService` for CRUD.
- `seatingNormalize` for geometry normalization.
- Firestore + callable functions.

### Observed UX Issues (descriptive)
- Very dense modal with multiple admin tasks (layout, overrides, allocation) combined.
- Complex interactions (drag/rotate, multi-form state) in a single surface.

---

## FloorplanViewer (`src/ui/components/apps/seating/FloorplanViewer.tsx`)

### Purpose
- Visualizes seating floorplans with zones and tables; optionally supports selection.
- Role: **admin / unit admin**.

### Inputs
- **Props:** `unitId`, `floorplanId`, `highlightTableIds`, `highlightZoneId`, `onZoneClick`, `onTableClick`.
- **Firestore data paths (via services):**
  - `units/{unitId}/seating_settings/default` (to resolve active floorplan).
  - `units/{unitId}/floorplans` (read).
  - `units/{unitId}/zones` (read).
  - `units/{unitId}/tables` (read).
- **Function endpoints:** none.

### State & Data Flow
- Internal state: `floorplan`, `zones`, `tables`, `loading`, `error`.
- **Allocation data flow:** only uses `highlightZoneId`/`highlightTableIds` passed in by parent (e.g., allocation override UI).

### User Interactions
- Optional click handlers for zones/tables (used by `AllocationPanel`).
- UI feedback: loading/error text, legend with zone colors.

### Dependencies
- `seatingAdminService` + `seatingService` for data.
- `seatingNormalize` utilities.

### Observed UX Issues (descriptive)
- If no active floorplan exists, user sees a plain message without guidance.

---

## FoglalasokApp (`src/ui/components/apps/FoglalasokApp.tsx`)

### Purpose
- Admin-facing **reservation management**: list, calendar view, booking detail modal, allocation overrides, seating assignment, and logs.
- Role: **admin / unit admin**.

### Inputs
- **Props:** `currentUser`, `canAddBookings`, `allUnits`, `activeUnitIds`.
- **Firestore data paths (direct):**
  - `units/{unitId}/reservations` (read/write via `addDoc`, `updateDoc`, `onSnapshot`).
  - `units/{unitId}/reservation_logs` (read via `onSnapshot`).
- **Firestore data paths (via services):**
  - `units/{unitId}/zones`, `units/{unitId}/tables` (seating info).
  - `units/{unitId}/table_combinations`.
  - `units/{unitId}/seating_settings/default`.
  - `units/{unitId}/allocation_overrides/{reservationId}` via reservationOverridesService.
- **Function endpoints:**
  - `recalcReservationCapacityDay` (admin capacity recalculation).

### State & Data Flow
- Internal state: active unit/date, bookings list, logs, seating settings, zones/tables/combinations, modal states, and local UI selections.
- **Allocation data flow (read/write):**
  - **Read:** `allocationIntent`, `allocationDiagnostics`, `allocationFinal`, and `allocated` fields are displayed in booking details.
  - **Write:** Allocation overrides are written via `setOverride` / `clearOverride` (reservation overrides service).
- **Seating assignment flow:**
  - `BookingSeatingEditor` writes `zoneId` and `assignedTableIds` via `updateReservationSeating` (service), which also writes a reservation log entry.
- **Deletion and creation:**
  - `AddBookingModal` writes new reservations via `addDoc` (no direct capacity ledger update here).
  - Deletion updates `status=cancelled` and writes timestamps.

### User Interactions
- Calendar navigation, open booking detail modal, seating edits, allocation override panel, floorplan viewer toggles, delete confirmations.
- UI feedback includes inline success/error text, loading spinners, and conflict warnings for table assignments.

### Dependencies
- Multiple services: seatingAdminService, seatingService, seatingSuggestionService, allocation table suggestion service.
- Tight coupling to Firestore live queries and booking schema.
- Embedded subcomponents (e.g., `BookingDetailsModal`, `BookingSeatingEditor`, `AllocationPanel`, `DeleteConfirmationModal`) are defined in-file.

### Observed UX Issues (descriptive)
- Dense booking detail panel with multiple allocation-related sections displayed as raw strings.
- Several nested modals and toggle panels within a single component file.
- Many admin operations are colocated (seating, allocation overrides, logs, capacity tools).

---

## ReservationSettingsModal (`src/ui/components/apps/ReservationSettingsModal.tsx`)

### Purpose
- Modal wrapper for reservation settings form (non-seating settings).
- Role: **admin / unit admin**.

### Inputs
- **Props:** `unitId`, `currentUser`, `onClose`.
- **Firestore/Endpoints:** none directly; delegates to `ReservationSettingsForm`.

### State & Data Flow
- Stateless wrapper that opens/closes on background click.
- No allocation fields used here.

### User Interactions
- Click backdrop to close.

### Dependencies
- Depends on `ReservationSettingsForm` for actual content.

### Observed UX Issues (descriptive)
- Modal closes on backdrop click; accidental close risk if user clicks outside.

---

## ReservationSettingsForm (`src/ui/components/apps/ReservationSettingsForm.tsx`)

### Purpose
- Admin-facing form for **reservation settings**: booking windows, daily capacity, blackout dates, guest form config, theme, and notification settings.
- Role: **admin / unit admin**.

### Inputs
- **Props:** `unitId`, `currentUser`, `onClose`, `layout`.
- **Firestore paths:**
  - `reservation_settings/{unitId}` (read/write via `getDoc`, `setDoc`).
- **Function endpoints:**
  - `overrideDailyCapacity` (admin capacity API service).

### State & Data Flow
- Local state: `settings`, `loading`, `isSaving`, `activeTab`, and override inputs.
- **Allocation data flow:**
  - No direct allocation fields, but `dailyCapacity` and `bookableWindow` shape capacity decisions on backend.
- **Write points:**
  - Writes reservation settings via `setDoc`.
  - Writes daily capacity override via admin API service.

### User Interactions
- Edit settings across tabs (general/form/theme).
- Save triggers write to Firestore.
- Capacity override triggers API call and displays success/error messages.

### Dependencies
- Theme helpers and `ColorPicker`.
- `overrideDailyCapacity` API service.

### Observed UX Issues (descriptive)
- Large form with multiple tabs and many settings; may require significant navigation.
- Multiple responsibilities combined (theme, form schema, capacity override).

---

# End-to-End UI → Backend → Firestore → UI Data Flow

1. **Guest booking (ReservationPage)**
   - UI reads `reservation_settings/{unitId}` and `reservation_capacity` to render the form and date availability.
   - Submits to `guestCreateReservation`.
   - Backend writes `units/{unitId}/reservations/{bookingId}`, `reservation_logs`, `reservation_capacity`, and allocation logs.
   - Admin UI (`FoglalasokApp`) reads reservations + logs and surfaces allocation fields.

2. **Guest manage flow (ManageReservationPage)**
   - UI calls `guestGetReservation` to fetch booking metadata.
   - Cancel/modify actions call `guestUpdateReservation` / `guestModifyReservation`.
   - Backend updates reservation, capacity ledger, logs; manage UI updates local state.

3. **Admin management (FoglalasokApp)**
   - Admin reads live reservation lists + logs and seating settings.
   - Manual seating edits write directly to `units/{unitId}/reservations/{bookingId}` and `reservation_logs` via services.
   - Allocation overrides are saved in `units/{unitId}/allocation_overrides` and displayed alongside allocation diagnostics.

4. **Seating configuration (SeatingSettingsModal)**
   - Admin updates `seating_settings`, `zones`, `tables`, `table_combinations`.
   - Backend allocation functions read these settings when computing allocation decisions.

---

# Files Inspected (UI Edit Map scope + required backend references)

- `src/ui/components/public/ReservationPage.tsx`
- `src/ui/components/public/PublicReservationLayout.tsx`
- `src/ui/components/public/ManageReservationPage.tsx`
- `src/ui/components/apps/SeatingSettingsModal.tsx`
- `src/ui/components/apps/seating/FloorplanViewer.tsx`
- `src/ui/components/apps/FoglalasokApp.tsx`
- `src/ui/components/apps/ReservationSettingsModal.tsx`
- `src/ui/components/apps/ReservationSettingsForm.tsx`
- `functions/src/index.ts`
- `functions/src/allocation/*`
- `functions/src/reservations/allocationEngine.ts`
- `functions/src/reservations/allocationOverrideService.ts`
- `functions/src/reservations/allocationLogService.ts`
- `functions/src/reservations/capacityLedgerService.ts`
- `src/core/services/seatingAdminService.ts`
- `src/core/services/seatingService.ts`

# Unknowns

- No additional UI components outside the UI Edit Map were inspected in this pass.
