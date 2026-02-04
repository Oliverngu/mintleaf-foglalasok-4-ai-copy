import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ScheduleSettings } from '../../../models/data.js';
import {
  normalizeClosingOffsetMinutes,
  normalizeScheduleSettings
} from '../normalizeScheduleSettings.js';

describe('normalizeClosingOffsetMinutes', () => {
  it('coerces invalid values to 0', () => {
    assert.equal(normalizeClosingOffsetMinutes(null), 0);
    assert.equal(normalizeClosingOffsetMinutes(undefined), 0);
    assert.equal(normalizeClosingOffsetMinutes(Number.NaN), 0);
  });

  it('clamps values to 0..240 and rounds', () => {
    assert.equal(normalizeClosingOffsetMinutes(999), 240);
    assert.equal(normalizeClosingOffsetMinutes(-5), 0);
    assert.equal(normalizeClosingOffsetMinutes(12.7), 13);
  });
});

describe('normalizeScheduleSettings', () => {
  it('fills missing days with defaults', () => {
    const settings = {
      id: 'unit_2024-06-10',
      unitId: 'unit',
      weekStartDate: '2024-06-10',
      showOpeningTime: true,
      showClosingTime: false,
      dailySettings: {
        0: {
          isOpen: false,
          openingTime: '09:00',
          closingTime: null,
          closingOffsetMinutes: 15,
          quotas: {}
        }
      }
    } as unknown as ScheduleSettings;

    const normalized = normalizeScheduleSettings(settings);
    assert.equal(Object.keys(normalized.dailySettings).length, 7);
    assert.equal(normalized.dailySettings[0].closingOffsetMinutes, 15);
    assert.equal(normalized.dailySettings[1].closingOffsetMinutes, 0);
  });

  it('fills missing closingTime with defaults but preserves null', () => {
    const settings = {
      id: 'unit_2024-06-10',
      unitId: 'unit',
      weekStartDate: '2024-06-10',
      showOpeningTime: false,
      showClosingTime: false,
      dailySettings: {
        0: {
          isOpen: true,
          openingTime: '09:00',
          closingTime: null,
          closingOffsetMinutes: 0,
          quotas: {}
        },
        1: {
          isOpen: true,
          openingTime: '09:00',
          closingTime: undefined,
          closingOffsetMinutes: 0,
          quotas: {}
        }
      }
    } as unknown as ScheduleSettings;

    const normalized = normalizeScheduleSettings(settings);
    assert.equal(normalized.dailySettings[0].closingTime, null);
    assert.equal(normalized.dailySettings[1].closingTime, '22:00');
  });
});
