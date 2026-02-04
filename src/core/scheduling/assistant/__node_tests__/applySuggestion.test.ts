import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applySuggestion } from '../apply/applySuggestion.js';
import { buildWeekDays } from '../../tests/engineTestHarness.js';
import type { EngineShift, Suggestion } from '../../engine/types.js';

describe('applySuggestion', () => {
  it('applies createShift and generates deterministic ids', () => {
    const weekDays = buildWeekDays();
    const suggestion: Suggestion = {
      type: 'ADD_SHIFT_SUGGESTION',
      expectedImpact: 'Add coverage',
      explanation: 'Add a shift.',
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

    const result = applySuggestion({
      suggestionId: 'assistant-suggestion:v2:abc123',
      suggestion,
      scheduleState: { unitId: 'unit-a', shifts: [] },
      appliedSuggestionIds: [],
    });

    assert.equal(result.status, 'applied');
    assert.equal(result.errors.length, 0);
    assert.equal(result.nextScheduleState.shifts.length, 1);
    assert.equal(result.nextScheduleState.shifts[0]?.id, 'gen:assistant-suggestion:v2:abc123:0');
    assert.deepEqual(result.effects, [
      {
        type: 'createShift',
        shiftId: 'gen:assistant-suggestion:v2:abc123:0',
        userId: 'u1',
        dateKey: weekDays[0],
        startTime: '09:00',
        endTime: '13:00',
        positionId: 'p1',
      },
    ]);
  });

  it('allows createShift cross-midnight times', () => {
    const weekDays = buildWeekDays();
    const suggestion: Suggestion = {
      type: 'ADD_SHIFT_SUGGESTION',
      expectedImpact: 'Add coverage',
      explanation: 'Add overnight shift.',
      actions: [
        {
          type: 'createShift',
          userId: 'u1',
          dateKey: weekDays[0],
          startTime: '22:00',
          endTime: '02:00',
        },
      ],
    };

    const result = applySuggestion({
      suggestionId: 'assistant-suggestion:v2:overnight',
      suggestion,
      scheduleState: { unitId: 'unit-a', shifts: [] },
      appliedSuggestionIds: [],
    });

    assert.equal(result.status, 'applied');
    assert.equal(result.errors.length, 0);
    assert.equal(result.nextScheduleState.shifts[0]?.startTime, '22:00');
    assert.equal(result.nextScheduleState.shifts[0]?.endTime, '02:00');
  });

  it('applies moveShift actions', () => {
    const weekDays = buildWeekDays();
    const shifts: EngineShift[] = [
      {
        id: 's1',
        userId: 'u1',
        unitId: 'unit-a',
        dateKey: weekDays[0],
        startTime: '08:00',
        endTime: '12:00',
        positionId: 'p1',
      },
    ];
    const suggestion: Suggestion = {
      type: 'SHIFT_MOVE_SUGGESTION',
      expectedImpact: 'Move shift',
      explanation: 'Move shift later.',
      actions: [
        {
          type: 'moveShift',
          shiftId: 's1',
          userId: 'u1',
          dateKey: weekDays[1],
          newStartTime: '10:00',
          newEndTime: '14:00',
          positionId: 'p1',
        },
      ],
    };

    const result = applySuggestion({
      suggestionId: 'assistant-suggestion:v2:def456',
      suggestion,
      scheduleState: { unitId: 'unit-a', shifts },
      appliedSuggestionIds: [],
    });

    assert.equal(result.status, 'applied');
    assert.equal(result.errors.length, 0);
    assert.equal(result.nextScheduleState.shifts[0]?.dateKey, weekDays[1]);
    assert.equal(result.nextScheduleState.shifts[0]?.startTime, '10:00');
    assert.equal(result.nextScheduleState.shifts[0]?.endTime, '14:00');
    assert.equal(result.effects[0]?.type, 'moveShift');
  });

  it('allows moveShift cross-midnight times', () => {
    const weekDays = buildWeekDays();
    const shifts: EngineShift[] = [
      {
        id: 's1',
        userId: 'u1',
        unitId: 'unit-a',
        dateKey: weekDays[0],
        startTime: '20:00',
        endTime: '23:00',
      },
    ];
    const suggestion: Suggestion = {
      type: 'SHIFT_MOVE_SUGGESTION',
      expectedImpact: 'Move shift',
      explanation: 'Move shift overnight.',
      actions: [
        {
          type: 'moveShift',
          shiftId: 's1',
          userId: 'u1',
          dateKey: weekDays[1],
          newStartTime: '22:00',
          newEndTime: '02:00',
        },
      ],
    };

    const result = applySuggestion({
      suggestionId: 'assistant-suggestion:v2:move-overnight',
      suggestion,
      scheduleState: { unitId: 'unit-a', shifts },
      appliedSuggestionIds: [],
    });

    assert.equal(result.status, 'applied');
    assert.equal(result.errors.length, 0);
    assert.equal(result.nextScheduleState.shifts[0]?.startTime, '22:00');
    assert.equal(result.nextScheduleState.shifts[0]?.endTime, '02:00');
  });

  it('returns noop for already applied suggestion ids', () => {
    const result = applySuggestion({
      suggestionId: 'assistant-suggestion:v2:no-op',
      suggestion: {
        type: 'ADD_SHIFT_SUGGESTION',
        expectedImpact: 'Add coverage',
        explanation: 'Add a shift.',
        actions: [
          {
            type: 'createShift',
            userId: 'u1',
            dateKey: '2025-01-06',
            startTime: '09:00',
            endTime: '13:00',
          },
        ],
      },
      scheduleState: { unitId: 'unit-a', shifts: [] },
      appliedSuggestionIds: ['assistant-suggestion:v2:no-op'],
    });

    assert.equal(result.status, 'noop');
    assert.equal(result.nextScheduleState.shifts.length, 0);
    assert.equal(result.effects.length, 0);
  });

  it('dedupes createShift when an identical shift exists', () => {
    const weekDays = buildWeekDays();
    const shifts: EngineShift[] = [
      {
        id: 's1',
        userId: 'u1',
        unitId: 'unit-a',
        dateKey: weekDays[0],
        startTime: '09:00',
        endTime: '13:00',
        positionId: 'p1',
      },
    ];
    const suggestion: Suggestion = {
      type: 'ADD_SHIFT_SUGGESTION',
      expectedImpact: 'Add coverage',
      explanation: 'Add duplicate shift.',
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

    const result = applySuggestion({
      suggestionId: 'assistant-suggestion:v2:dedupe',
      suggestion,
      scheduleState: { unitId: 'unit-a', shifts },
      appliedSuggestionIds: [],
    });

    assert.equal(result.status, 'noop');
    assert.equal(result.effects.length, 0);
    assert.equal(result.nextScheduleState.shifts.length, 1);
  });

  it('is transactional when an action fails', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const weekDays = buildWeekDays();
    const shifts: EngineShift[] = [
      {
        id: 's1',
        userId: 'u1',
        unitId: 'unit-a',
        dateKey: weekDays[0],
        startTime: '08:00',
        endTime: '12:00',
      },
    ];
    const suggestion: Suggestion = {
      type: 'SHIFT_MOVE_SUGGESTION',
      expectedImpact: 'Move shift',
      explanation: 'Move then fail.',
      actions: [
        {
          type: 'moveShift',
          shiftId: 's1',
          userId: 'u1',
          dateKey: weekDays[1],
          newStartTime: '09:00',
          newEndTime: '13:00',
        },
        {
          type: 'moveShift',
          shiftId: 'missing',
          userId: 'u1',
          dateKey: weekDays[2],
          newStartTime: '10:00',
          newEndTime: '14:00',
        },
      ],
    };

    const result = applySuggestion({
      suggestionId: 'assistant-suggestion:v2:txn',
      suggestion,
      scheduleState: { unitId: 'unit-a', shifts },
      appliedSuggestionIds: [],
    });

    try {
      assert.equal(result.status, 'failed');
      assert.equal(result.nextScheduleState.shifts[0]?.dateKey, weekDays[0]);
      assert.equal(result.effects.length, 0);
      assert.equal(result.errors.length, 1);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('does not throw in production for malformed actions', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const suggestion: Suggestion = {
        type: 'ADD_SHIFT_SUGGESTION',
        expectedImpact: 'Add coverage',
        explanation: 'Malformed createShift.',
        actions: [
          {
            type: 'createShift',
            userId: 'u1',
            dateKey: '2025-01-06',
            startTime: '',
            endTime: '13:00',
          },
        ],
      };

      const result = applySuggestion({
        suggestionId: 'assistant-suggestion:v2:bad',
        suggestion,
        scheduleState: { unitId: 'unit-a', shifts: [] },
        appliedSuggestionIds: [],
      });

      assert.equal(result.status, 'failed');
      assert.equal(result.errors[0]?.code, 'missing_fields');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('fails in production for invalid time formats', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const suggestion: Suggestion = {
        type: 'ADD_SHIFT_SUGGESTION',
        expectedImpact: 'Add coverage',
        explanation: 'Invalid time format.',
        actions: [
          {
            type: 'createShift',
            userId: 'u1',
            dateKey: '2025-01-06',
            startTime: '9:00',
            endTime: '13:00',
          },
        ],
      };

      const result = applySuggestion({
        suggestionId: 'assistant-suggestion:v2:bad-time',
        suggestion,
        scheduleState: { unitId: 'unit-a', shifts: [] },
        appliedSuggestionIds: [],
      });

      assert.equal(result.status, 'failed');
      assert.equal(result.errors[0]?.code, 'invalid_time_format');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('fails in production when moveShift user mismatches', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const weekDays = buildWeekDays();
    const shifts: EngineShift[] = [
      {
        id: 's1',
        userId: 'u2',
        unitId: 'unit-a',
        dateKey: weekDays[0],
        startTime: '08:00',
        endTime: '12:00',
      },
    ];
    const suggestion: Suggestion = {
      type: 'SHIFT_MOVE_SUGGESTION',
      expectedImpact: 'Move shift',
      explanation: 'User mismatch.',
      actions: [
        {
          type: 'moveShift',
          shiftId: 's1',
          userId: 'u1',
          dateKey: weekDays[1],
          newStartTime: '09:00',
          newEndTime: '13:00',
        },
      ],
    };

    try {
      const result = applySuggestion({
        suggestionId: 'assistant-suggestion:v2:user-mismatch',
        suggestion,
        scheduleState: { unitId: 'unit-a', shifts },
        appliedSuggestionIds: [],
      });

      assert.equal(result.status, 'failed');
      assert.equal(result.errors[0]?.code, 'user_mismatch');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
