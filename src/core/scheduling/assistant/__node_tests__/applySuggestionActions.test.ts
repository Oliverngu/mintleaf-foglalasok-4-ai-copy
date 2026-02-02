import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applySuggestionActions } from '../applySuggestionActions';
import { buildWeekDays, makeEngineInput } from '../../tests/engineTestHarness';
import type { Suggestion } from '../../engine/types';

describe('applySuggestionActions', () => {
  it('moves an existing shift deterministically', () => {
    const weekDays = buildWeekDays();
    const input = makeEngineInput({
      weekDays,
      shifts: [
        {
          id: 's1',
          userId: 'u1',
          unitId: 'unit-a',
          dateKey: weekDays[0],
          startTime: '08:00',
          endTime: '12:00',
          positionId: 'p1',
        },
      ],
    });

    const suggestion: Suggestion = {
      type: 'SHIFT_MOVE_SUGGESTION',
      expectedImpact: 'Move shift earlier',
      explanation: 'Move shift to earlier window.',
      actions: [
        {
          type: 'moveShift',
          shiftId: 's1',
          userId: 'u1',
          dateKey: weekDays[1],
          newStartTime: '07:00',
          newEndTime: '11:00',
          positionId: 'p1',
        },
      ],
    };

    const result = applySuggestionActions(input, suggestion);
    const updatedShift = result.nextShifts.find(shift => shift.id === 's1');

    assert.equal(updatedShift?.dateKey, weekDays[1]);
    assert.equal(updatedShift?.startTime, '07:00');
    assert.equal(updatedShift?.endTime, '11:00');
    assert.deepEqual(result.rejectedActionKeys, []);
  });

  it('creates a deterministic shift id for createShift', () => {
    const weekDays = buildWeekDays();
    const input = makeEngineInput({ weekDays, shifts: [] });

    const suggestion: Suggestion = {
      type: 'ADD_SHIFT_SUGGESTION',
      expectedImpact: 'Add coverage',
      explanation: 'Add a new shift.',
      actions: [
        {
          type: 'createShift',
          userId: 'u1',
          dateKey: weekDays[0],
          startTime: '09:00',
          endTime: '13:00',
          positionId: 'p1',
        },
      ],
    };

    const result = applySuggestionActions(input, suggestion);
    const newShift = result.nextShifts.find(shift => shift.id.startsWith('gen:'));

    assert.equal(
      newShift?.id,
      'gen:u1:2025-01-06:09:00:13:00:p1'
    );
    assert.equal(newShift?.userId, 'u1');
    assert.equal(newShift?.dateKey, weekDays[0]);
  });

  it('rejects invalid moveShift action without changing shifts', () => {
    const weekDays = buildWeekDays();
    const input = makeEngineInput({
      weekDays,
      shifts: [
        {
          id: 's1',
          userId: 'u1',
          unitId: 'unit-a',
          dateKey: weekDays[0],
          startTime: '08:00',
          endTime: '12:00',
          positionId: 'p1',
        },
      ],
    });

    const suggestion: Suggestion = {
      type: 'SHIFT_MOVE_SUGGESTION',
      expectedImpact: 'Move shift',
      explanation: 'Invalid move shift.',
      actions: [
        {
          type: 'moveShift',
          shiftId: 'missing',
          userId: 'u1',
          dateKey: weekDays[1],
          newStartTime: '07:00',
          newEndTime: '11:00',
          positionId: 'p1',
        },
      ],
    };

    const result = applySuggestionActions(input, suggestion);

    assert.equal(result.nextShifts.length, 1);
    assert.equal(result.nextShifts[0].id, 's1');
    assert.equal(result.rejectedActionKeys.length, 1);
    assert.equal(result.issues.length, 1);
  });
});
