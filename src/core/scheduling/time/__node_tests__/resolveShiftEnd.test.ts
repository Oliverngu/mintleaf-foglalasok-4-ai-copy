import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateShiftDurationHours,
  resolveShiftEndDate
} from '../resolveShiftEnd.js';

describe('resolveShiftEndDate', () => {
  it('returns explicit end when provided', () => {
    const start = new Date('2024-06-10T08:00:00');
    const end = new Date('2024-06-10T12:00:00');
    const resolved = resolveShiftEndDate({
      start,
      end,
      dateKey: '2024-06-10',
      closingTime: '22:00'
    });
    assert.equal(resolved?.getTime(), end.getTime());
  });

  it('uses closing time when end is null', () => {
    const start = new Date('2024-06-10T08:00:00');
    const expected = new Date('2024-06-10T18:30:00');
    const resolved = resolveShiftEndDate({
      start,
      end: null,
      dateKey: '2024-06-10',
      closingTime: '18:30'
    });
    assert.equal(resolved?.getTime(), expected.getTime());
  });

  it('adds a day when closing time is before start', () => {
    const start = new Date('2024-06-10T23:00:00');
    const expected = new Date('2024-06-11T02:00:00');
    const resolved = resolveShiftEndDate({
      start,
      end: null,
      dateKey: '2024-06-10',
      closingTime: '02:00'
    });
    assert.equal(resolved?.getTime(), expected.getTime());
  });

  it('applies closing offset minutes', () => {
    const start = new Date('2024-06-10T20:00:00');
    const expected = new Date('2024-06-10T22:30:00');
    const resolved = resolveShiftEndDate({
      start,
      end: null,
      dateKey: '2024-06-10',
      closingTime: '22:00',
      closingOffsetMinutes: 30
    });
    assert.equal(resolved?.getTime(), expected.getTime());
  });
});

describe('calculateShiftDurationHours', () => {
  it('returns 0 for invalid closing time', () => {
    const duration = calculateShiftDurationHours({
      start: new Date('2024-06-10T08:00:00'),
      end: null,
      dateKey: '2024-06-10',
      closingTime: '25:99'
    });
    assert.equal(duration, 0);
  });

  it('returns 0 when closing time is missing', () => {
    const duration = calculateShiftDurationHours({
      start: new Date('2024-06-10T08:00:00'),
      end: null,
      dateKey: '2024-06-10'
    });
    assert.equal(duration, 0);
  });
});
