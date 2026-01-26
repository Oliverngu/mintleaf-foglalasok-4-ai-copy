# Engine V1 Spec (Domain Engine)

## ENGINE_V1_MAP

- `src/core/scheduling/engine/runEngine.ts` — Engine entrypoint; runs capacity compute, constraint evaluation, suggestion generation, and returns an explanation trace.
- `src/core/scheduling/engine/computeCapacity.ts` — Builds the per-slot/per-position capacity map from shifts and resolves shift time ranges (including cross-midnight handling).
- `src/core/scheduling/engine/evaluateConstraints.ts` — Aggregates constraint results and normalizes/sorts violations deterministically.
- `src/core/scheduling/engine/generateSuggestions.ts` — Builds shift move/add suggestions based on min-coverage violations.
- `src/core/scheduling/engine/timeUtils.ts` — Date/time helpers (slot keys, time math, formatting).
- `src/core/scheduling/engine/types.ts` — Domain types for inputs, rules, violations, suggestions, and outputs.
- `src/core/scheduling/rules/constraints/minCoverageByPosition.ts` — Evaluates minimum coverage per position/slot rule.
- `src/core/scheduling/rules/constraints/maxHoursPerDay.ts` — Evaluates max hours per user per day.
- `src/core/scheduling/rules/constraints/minRestHoursBetweenShifts.ts` — Evaluates minimum rest hours between consecutive shifts per user.

## Minimal Requirement Model (V1)

### Inputs

- **Unit scope:** `EngineInput.unitId` is assumed to scope the input to a single unit. The engine does not merge multi-unit data.
- **Week:** `weekStart` + `weekDays` (array of date keys, e.g. `YYYY-MM-DD`).
- **Users & Positions:** Basic identifiers and metadata for scheduling and filtering.
- **Shifts:** Each `EngineShift` includes `dateKey`, optional `startTime` and `endTime`, and `positionId`. `isDayOff` excludes a user from capacity and rules.
- **Schedule settings:** `dailySettings` supplies opening/closing time and optional closing offset by day index. If a shift has no `endTime`, the closing time + offset is used as its end. If no daily settings are provided for a day, defaults are used.
- **Ruleset:** Optional rules: `bucketMinutes`, `minCoverageByPosition`, `maxHoursPerDay`, `minRestHoursBetweenShifts`.

### Capacity

- **Definition:** Capacity is the **count of assigned shifts per position per slot**.
- **Slot size:** `bucketMinutes` (default `60`) defines slot length. Slots are expressed as `YYYY-MM-DDTHH:mm` (from `getSlotKey`).
- **Per shift:** Each shift contributes `+1` capacity to every slot the shift covers.
- **Cross-midnight:** If an end time is earlier than (or equal to) the start time, the shift is treated as crossing midnight and ends on the next day.

### Slots

- **Bucketed by minutes:** Starting at each shift’s start time and stepping by `bucketMinutes` until the shift end time.
- **Slot boundaries:** A slot represents the time from `slotStart` (inclusive) to `slotStart + bucketMinutes` (exclusive).
- **Cross-midnight handling:** Slots can span into the next day using the `dateKey` derived from the slot’s actual timestamp.

### Requirements (V1 Only)

- **Minimum coverage per position:** `minCoverageByPosition` ensures a minimum number of staff per position for each slot within the configured window.
- **Maximum hours per day:** `maxHoursPerDay` limits total worked hours per user per date key.
- **Minimum rest between shifts:** `minRestHoursBetweenShifts` enforces a minimum rest interval between consecutive shifts for each user.

> Note: Opening hours and closed-day rules are **not** enforced as violations in V1 unless already represented by existing rules.

### Violations

Each violation uses the following structure:

- **constraintId:** Stable identifier (e.g. `MIN_COVERAGE_BY_POSITION`).
- **severity:** `high | medium | low`.
- **message:** Short, human-readable explanation.
- **affected:** Populated arrays for the relevant identifiers:
  - `userIds`, `shiftIds`, `dateKeys`, `slots`, and optional `positionId`.

Violations are sorted deterministically by severity (high → low), then `constraintId`, then affected identifiers.

### Outputs

- **capacityMap:** Aggregated per-slot/per-position capacity map.
- **violations:** Deterministic, normalized list of constraint violations.
- **suggestions:** Optional suggestions based on min-coverage violations.
- **explanation.trace:** Pipeline steps executed by the engine.
