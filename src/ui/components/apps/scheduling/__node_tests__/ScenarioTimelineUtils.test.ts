import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Scenario } from '../../../../../core/scheduling/scenarios/types.js';
import {
  buildSuggestionViolationLinks,
  filterSuggestionViolationLinksByFocus,
  getScenarioFocusTimeOptions,
  rangesOverlap,
  describeScenario,
  summarizeSuggestions,
  summarizeViolationsBySeverity
} from '../ScenarioTimelineUtils.js';

describe('rangesOverlap', () => {
  it('detects overlap for same-day ranges', () => {
    assert.equal(rangesOverlap('10:00', '12:00', '11:00', '13:00'), true);
    assert.equal(rangesOverlap('10:00', '12:00', '12:00', '13:00'), false);
  });

  it('handles cross-midnight ranges', () => {
    assert.equal(rangesOverlap('22:00', '02:00', '01:00', '03:00'), true);
    assert.equal(rangesOverlap('22:00', '02:00', '03:00', '04:00'), false);
  });
});

describe('getScenarioFocusTimeOptions', () => {
  it('returns all day and unique scenario time ranges for a date', () => {
    const scenarios: Scenario[] = [
      {
        id: '1',
        unitId: 'unit',
        weekStartDate: '2024-01-01',
        type: 'EVENT',
        payload: {
          dateKeys: ['2024-01-02'],
          timeRange: { startTime: '10:00', endTime: '12:00' }
        }
      },
      {
        id: '2',
        unitId: 'unit',
        weekStartDate: '2024-01-01',
        type: 'PEAK',
        payload: {
          dateKeys: ['2024-01-02'],
          timeRange: { startTime: '10:00', endTime: '12:00' },
          minCoverageOverrides: []
        }
      },
      {
        id: '3',
        unitId: 'unit',
        weekStartDate: '2024-01-01',
        type: 'EVENT',
        payload: {
          dateKeys: ['2024-01-03'],
          timeRange: { startTime: '18:00', endTime: '20:00' }
        }
      }
    ];

    const options = getScenarioFocusTimeOptions(scenarios, '2024-01-02');
    assert.equal(options[0].key, 'ALL_DAY');
    assert.equal(options.length, 2);
    assert.equal(options[1].label, '10:00–12:00');
  });

  it('uses scenario.dateKeys when payload dateKeys are missing', () => {
    const scenarios: Scenario[] = [
      {
        id: '4',
        unitId: 'unit',
        weekStartDate: '2024-01-01',
        type: 'EVENT',
        dateKeys: ['2024-01-04'],
        payload: {
          dateKeys: [],
          timeRange: { startTime: '14:00', endTime: '16:00' }
        }
      }
    ];

    const options = getScenarioFocusTimeOptions(scenarios, '2024-01-04');
    assert.equal(options.length, 2);
    assert.equal(options[1].label, '14:00–16:00');
  });
});

describe('summarizeViolationsBySeverity', () => {
  it('counts severities and highest severity', () => {
    const summary = summarizeViolationsBySeverity([
      { constraintId: 'A', severity: 'low', message: '', affected: {} },
      { constraintId: 'B', severity: 'medium', message: '', affected: {} },
      { constraintId: 'C', severity: 'high', message: '', affected: {} },
      { constraintId: 'D', severity: 'high', message: '', affected: {} }
    ]);
    assert.deepEqual(summary, {
      low: 1,
      medium: 1,
      high: 2,
      total: 4,
      highestSeverity: 'high'
    });
  });
});

describe('summarizeSuggestions', () => {
  it('counts suggestion types and formats first action label', () => {
    const summary = summarizeSuggestions(
      [
        {
          type: 'SHIFT_MOVE_SUGGESTION',
          expectedImpact: '',
          explanation: '',
          actions: [
            {
              type: 'moveShift',
              shiftId: 'shift-1',
              userId: 'user-1',
              dateKey: '2024-01-02',
              newStartTime: '09:00',
              newEndTime: '12:00',
              positionId: 'pos-1'
            }
          ]
        },
        {
          type: 'ADD_SHIFT_SUGGESTION',
          expectedImpact: '',
          explanation: '',
          actions: [
            {
              type: 'createShift',
              userId: 'user-2',
              dateKey: '2024-01-02',
              startTime: '13:00',
              endTime: '17:00'
            }
          ]
        }
      ],
      new Map([['user-1', 'Maya']]),
      new Map([['pos-1', 'Barista']])
    );

    assert.equal(summary.total, 2);
    assert.deepEqual(summary.byType, {
      SHIFT_MOVE_SUGGESTION: 1,
      ADD_SHIFT_SUGGESTION: 1
    });
    assert.equal(summary.firstActionLabel, 'Mozgatás: Maya · 2024-01-02 · 09:00–12:00 · Barista');
  });
});

describe('describeScenario', () => {
  it('returns metadata-aware string for event scenarios', () => {
    const scenario: Scenario = {
      id: 'event-1',
      unitId: 'unit',
      weekStartDate: '2024-01-01',
      type: 'EVENT',
      payload: {
        dateKeys: ['2024-01-02'],
        timeRange: { startTime: '10:00', endTime: '12:00' }
      }
    };

    const label = describeScenario(scenario, new Map(), new Map([['pos-1', 'Barista']]));
    assert.ok(label.includes('Esemény'));
    assert.ok(label.includes('2024-01-02'));
    assert.ok(label.includes('10:00–12:00'));
  });
});

describe('buildSuggestionViolationLinks', () => {
  it('links suggestions to violations by date and position', () => {
    const violations = [
      {
        constraintId: 'MIN_COVERAGE_BY_POSITION',
        severity: 'high' as const,
        message: 'missing',
        affected: {
          dateKeys: ['2024-01-02'],
          positionId: 'pos-1'
        }
      }
    ];
    const suggestions = [
      {
        type: 'ADD_SHIFT_SUGGESTION' as const,
        expectedImpact: '',
        explanation: '',
        actions: [
          {
            type: 'createShift' as const,
            userId: 'user-1',
            dateKey: '2024-01-02',
            startTime: '10:00',
            endTime: '12:00',
            positionId: 'pos-1'
          }
        ]
      }
    ];

    const links = buildSuggestionViolationLinks(violations, suggestions, new Map(), new Map());
    const violationKey = Array.from(links.violationsByKey.keys())[0];
    const suggestionKey = Array.from(links.suggestionsByKey.keys())[0];
    assert.deepEqual(links.violationToSuggestions.get(violationKey), [suggestionKey]);
    assert.deepEqual(links.suggestionToViolations.get(suggestionKey), [violationKey]);
  });

  it('does not link suggestions when dates do not match', () => {
    const violations = [
      {
        constraintId: 'MIN_COVERAGE_BY_POSITION',
        severity: 'medium' as const,
        message: 'missing',
        affected: {
          dateKeys: ['2024-01-03'],
          positionId: 'pos-1'
        }
      }
    ];
    const suggestions = [
      {
        type: 'SHIFT_MOVE_SUGGESTION' as const,
        expectedImpact: '',
        explanation: '',
        actions: [
          {
            type: 'moveShift' as const,
            shiftId: 'shift-1',
            userId: 'user-2',
            dateKey: '2024-01-02',
            newStartTime: '09:00',
            newEndTime: '11:00',
            positionId: 'pos-1'
          }
        ]
      }
    ];

    const links = buildSuggestionViolationLinks(violations, suggestions, new Map(), new Map());
    const violationKey = Array.from(links.violationsByKey.keys())[0];
    const suggestionKey = Array.from(links.suggestionsByKey.keys())[0];
    assert.deepEqual(links.violationToSuggestions.get(violationKey), []);
    assert.equal(links.suggestionToViolations.get(suggestionKey)?.length ?? 0, 0);
  });
});

describe('filterSuggestionViolationLinksByFocus', () => {
  it('filters links to the focused date and time range', () => {
    const violations = [
      {
        constraintId: 'MIN_COVERAGE_BY_POSITION',
        severity: 'high' as const,
        message: 'missing',
        affected: {
          dateKeys: ['2024-01-02'],
          slots: ['2024-01-02 10:00-12:00'],
          positionId: 'pos-1'
        }
      }
    ];
    const suggestions = [
      {
        type: 'ADD_SHIFT_SUGGESTION' as const,
        expectedImpact: '',
        explanation: '',
        actions: [
          {
            type: 'createShift' as const,
            userId: 'user-1',
            dateKey: '2024-01-02',
            startTime: '10:00',
            endTime: '12:00',
            positionId: 'pos-1'
          }
        ]
      }
    ];

    const links = buildSuggestionViolationLinks(violations, suggestions, new Map(), new Map());
    const filtered = filterSuggestionViolationLinksByFocus(
      links,
      { dateKey: '2024-01-02', timeRange: { startTime: '09:00', endTime: '11:00' } },
      violations,
      suggestions
    );

    const violationKey = Array.from(filtered.violationsByKey.keys())[0];
    assert.deepEqual(filtered.violationToSuggestions.get(violationKey), [
      Array.from(filtered.suggestionsByKey.keys())[0]
    ]);
  });
});
