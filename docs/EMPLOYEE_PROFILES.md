# Employee Profiles (V1)

## Collection path
`units/{unitId}/employeeProfiles/{userId}`

## Schema
```ts
type EmployeeProfileV1 = {
  version: 1;
  userId: string;
  unitId: string;
  availability: {
    weekly: Record<string, { startHHmm: string; endHHmm: string }[]>;
    exceptions: {
      dateKey: string;
      available: boolean;
      windows?: { startHHmm: string; endHHmm: string }[];
    }[];
  };
  skillsByPositionId: Record<string, 1 | 2 | 3 | 4 | 5>;
  scores?: { reliability?: number; punctuality?: number };
  limits?: { maxHoursPerWeek?: number; maxHoursPerDay?: number };
  preferences?: { preferredPositionIds?: string[]; avoidClose?: boolean };
  updatedAt?: Timestamp | null;
};
```

## Availability semantics
- Weekly availability uses day-of-week keys (`"0"` = Sunday ... `"6"` = Saturday).
- Exceptions override weekly availability for the given `dateKey`.
  - `available: false` means unavailable all day.
  - `available: true` with no windows means available all day.
- Cross‑midnight windows are supported (e.g. `22:00–02:00`).
- If a user has no profile, they are treated as available.

## Example document
```json
{
  "version": 1,
  "userId": "user-123",
  "unitId": "unit-abc",
  "availability": {
    "weekly": {
      "1": [{ "startHHmm": "09:00", "endHHmm": "17:00" }],
      "2": [{ "startHHmm": "09:00", "endHHmm": "17:00" }]
    },
    "exceptions": [
      { "dateKey": "2025-02-14", "available": false },
      {
        "dateKey": "2025-02-15",
        "available": true,
        "windows": [{ "startHHmm": "10:00", "endHHmm": "14:00" }]
      }
    ]
  },
  "skillsByPositionId": {
    "pos-1": 4,
    "pos-2": 2
  },
  "scores": { "reliability": 92, "punctuality": 88 },
  "limits": { "maxHoursPerWeek": 40, "maxHoursPerDay": 8 },
  "preferences": { "preferredPositionIds": ["pos-1"], "avoidClose": true }
}
```
