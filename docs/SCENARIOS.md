# Scenarios (v1)

Scenarios provide explicit, typed inputs that model real-world events (sickness, peaks, events, last‑minute changes) without mutating stored shifts. Scenarios are attached to a unit + week and are applied in-memory when the engine runs.

## Types

- **SICKNESS**
  - Payload: `{ userId, dateKeys[], reason?, severity? }`
  - Effect: removes the user’s shifts for the specified date keys from engine input.

- **EVENT**
  - Payload: `{ dateKeys[], timeRange, expectedLoadMultiplier?, minCoverageOverrides? }`
  - Effect: converts `minCoverageOverrides` into additional min coverage rules for the specified time range.

- **PEAK**
  - Payload: `{ dateKeys[], timeRange, minCoverageOverrides }`
  - Effect: converts overrides into min coverage rules.

- **LAST_MINUTE**
  - Payload: `{ timestamp, description, patches[] }`
  - Effect: stored for future diffing; no engine mutation in v1.

## Storage

Scenarios are stored in the `schedule_scenarios` collection using a flat schema:

```
/schedule_scenarios/{scenarioId}
```

Each document includes `unitId`, `weekStartDate`, `type`, `payload`, and optional `dateKeys` for quick filtering.

## Validation / normalization rules

- `dateKeys` must be in `YYYY-MM-DD` format; invalid entries are ignored at application time.
- `timeRange.startTime` / `timeRange.endTime` must be `HH:MM`.
  - Cross-midnight ranges are allowed by the engine (end <= start means next day).
- `minCoverageOverrides` items must include `positionId` and `minCount > 0`.

## Engine application (v1)

Scenarios are applied in a pure pre-processing step before capacity + constraint evaluation. The original input is not mutated.
