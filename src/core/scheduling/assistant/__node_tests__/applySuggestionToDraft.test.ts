import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Timestamp } from 'firebase/firestore';
import type { Shift } from '../../../models/data.js';
import type { Suggestion } from '../../engine/types.js';
import { applySuggestionToDraft } from '../applySuggestionToDraft.js';

const makeShift = (overrides: Partial<Shift>): Shift => ({
  id: 'shift-1',
  userId: 'user-1',
  userName: 'User 1',
  unitId: 'unit-1',
  position: 'Barista',
  start: Timestamp.fromDate(new Date('2024-01-02T09:00:00')),
  end: Timestamp.fromDate(new Date('2024-01-02T12:00:00')),
  status: 'draft',
  isDayOff: false,
  dayKey: '2024-01-02',
  ...overrides
});

describe('applySuggestionToDraft', () => {
  it('moves an existing shift and updates date/time', () => {
    const draft = { shifts: [makeShift({})] };
    const suggestion: Suggestion = {
      type: 'SHIFT_MOVE_SUGGESTION',
      expectedImpact: '',
      explanation: '',
      actions: [
        {
          type: 'moveShift',
          shiftId: 'shift-1',
          userId: 'user-1',
          dateKey: '2024-01-03',
          newStartTime: '10:00',
          newEndTime: '14:00',
          positionId: 'pos-1'
        }
      ]
    };

    const nextDraft = applySuggestionToDraft(draft, suggestion);
    assert.equal(nextDraft.shifts.length, 1);
    const updated = nextDraft.shifts[0];
    assert.equal(updated.dayKey, '2024-01-03');
    assert.equal(updated.position, 'pos-1');
    assert.equal(
      updated.start?.toDate().getTime(),
      new Date('2024-01-03T10:00:00').getTime()
    );
    assert.equal(
      updated.end?.toDate().getTime(),
      new Date('2024-01-03T14:00:00').getTime()
    );
  });

  it('creates a new shift for create actions and handles cross-midnight', () => {
    const draft = { shifts: [makeShift({})] };
    const suggestion: Suggestion = {
      type: 'ADD_SHIFT_SUGGESTION',
      expectedImpact: '',
      explanation: '',
      actions: [
        {
          type: 'createShift',
          userId: 'user-2',
          dateKey: '2024-01-04',
          startTime: '22:00',
          endTime: '02:00',
          positionId: 'pos-2'
        }
      ]
    };

    const nextDraft = applySuggestionToDraft(draft, suggestion);
    assert.equal(nextDraft.shifts.length, 2);
    const created = nextDraft.shifts[1];
    assert.equal(created.userId, 'user-2');
    assert.equal(created.position, 'pos-2');
    assert.equal(created.dayKey, '2024-01-04');
    assert.equal(
      created.start?.toDate().getTime(),
      new Date('2024-01-04T22:00:00').getTime()
    );
    assert.equal(
      created.end?.toDate().getTime(),
      new Date('2024-01-05T02:00:00').getTime()
    );
  });
});
