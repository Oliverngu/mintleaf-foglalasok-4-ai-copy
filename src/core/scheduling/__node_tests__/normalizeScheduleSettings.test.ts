import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeScheduleSettings } from '../normalizeScheduleSettings.js';
import { DEFAULT_CLOSING_TIME } from '../engine/timeUtils.js';

describe('normalizeScheduleSettings', () => {
  it('sets inherit when closingTime is null', () => {
    const normalized = normalizeScheduleSettings({
      id: 'unit-1_2025-01-06',
      unitId: 'unit-1',
      weekStartDate: '2025-01-06',
      showOpeningTime: false,
      showClosingTime: false,
      dailySettings: {
        0: {
          isOpen: true,
          openingTime: '08:00',
          closingTime: null,
          closingOffsetMinutes: 15,
          quotas: {}
        }
      }
    });

    assert.equal(normalized.dailySettings[0].closingTime, DEFAULT_CLOSING_TIME);
    assert.equal(normalized.dailySettings[0].closingTimeInherit, true);
    assert.equal(Object.keys(normalized.dailySettings).length, 7);
  });

  it('infers inherit false when closingTime is provided', () => {
    const normalized = normalizeScheduleSettings({
      id: 'unit-1_2025-01-06',
      unitId: 'unit-1',
      weekStartDate: '2025-01-06',
      showOpeningTime: true,
      showClosingTime: true,
      dailySettings: {
        2: {
          isOpen: true,
          openingTime: '09:00',
          closingTime: '21:00',
          closingOffsetMinutes: 0,
          quotas: {}
        }
      }
    });

    assert.equal(normalized.dailySettings[2].closingTime, '21:00');
    assert.equal(normalized.dailySettings[2].closingTimeInherit, false);
  });
});
