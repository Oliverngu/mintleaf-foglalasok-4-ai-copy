import { normalizeBucketMinutes } from '../engine/timeUtils';
import {
  ConstraintViolation,
  EngineInput,
  EngineResult,
  Severity,
  Suggestion,
  SuggestionAction,
} from '../engine/types';
import { buildViolationAffectedKey } from '../engine/violationUtils';
import { Explanation } from './types';

type SuggestionPipelineInput = {
  input: EngineInput;
  result: Pick<EngineResult, 'capacityMap' | 'violations' | 'suggestions'>;
};

type SuggestionPipelineOutput = {
  suggestions: Suggestion[];
  explanations: Explanation[];
};

const severityRank: Record<Severity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const kindRank: Record<Explanation['kind'], number> = {
  violation: 0,
  suggestion: 1,
  info: 2,
};

const normalizeArray = (values?: string[]) =>
  values ? Array.from(new Set(values)).sort() : [];

const buildViolationId = (violation: ConstraintViolation) =>
  `violation:${violation.constraintId}:${buildViolationAffectedKey(violation)}`;

const buildActionKey = (action: SuggestionAction) => {
  if (action.type === 'moveShift') {
    return [
      action.type,
      action.shiftId,
      action.userId,
      action.dateKey,
      action.newStartTime,
      action.newEndTime,
      action.positionId ?? '',
    ].join('|');
  }

  return [
    action.type,
    action.userId,
    action.dateKey,
    action.startTime,
    action.endTime,
    action.positionId ?? '',
  ].join('|');
};

const buildSuggestionId = (suggestion: Suggestion) =>
  [
    'suggestion',
    suggestion.type,
    suggestion.actions.map(buildActionKey).join(';'),
    suggestion.expectedImpact,
    suggestion.explanation,
  ].join(':');

const buildSuggestionAffected = (suggestion: Suggestion) => {
  const userIds: string[] = [];
  const shiftIds: string[] = [];
  const dateKeys: string[] = [];
  const positionIds: string[] = [];

  suggestion.actions.forEach(action => {
    userIds.push(action.userId);
    if (action.type === 'moveShift') {
      shiftIds.push(action.shiftId);
      dateKeys.push(action.dateKey);
      if (action.positionId) positionIds.push(action.positionId);
    } else {
      dateKeys.push(action.dateKey);
      if (action.positionId) positionIds.push(action.positionId);
    }
  });

  return {
    userIds: normalizeArray(userIds),
    shiftIds: normalizeArray(shiftIds),
    dateKeys: normalizeArray(dateKeys),
    positionId: positionIds.sort()[0],
  };
};

const createViolationExplanation = (violation: ConstraintViolation): Explanation => ({
  id: buildViolationId(violation),
  kind: 'violation',
  severity: violation.severity,
  title: violation.constraintId,
  details: violation.message,
  affected: {
    userIds: normalizeArray(violation.affected.userIds ?? []),
    shiftIds: normalizeArray(violation.affected.shiftIds ?? []),
    slots: normalizeArray(violation.affected.slots ?? []),
    positionId: violation.affected.positionId,
    dateKeys: normalizeArray(violation.affected.dateKeys ?? []),
  },
  relatedConstraintId: violation.constraintId,
});

const createSuggestionExplanation = (suggestion: Suggestion): Explanation => ({
  id: buildSuggestionId(suggestion),
  kind: 'suggestion',
  severity: 'low',
  title: suggestion.type,
  details: suggestion.explanation,
  affected: buildSuggestionAffected(suggestion),
  relatedSuggestionId: buildSuggestionId(suggestion),
});

const createInfoExplanations = (input: EngineInput): Explanation[] => {
  const bucketMinutes = normalizeBucketMinutes(input.ruleset.bucketMinutes);
  return [
    {
      id: `info:bucketMinutes:${bucketMinutes}`,
      kind: 'info',
      severity: 'low',
      title: 'Bucket minutes normalized',
      details: `Bucket minutes normalized to ${bucketMinutes}.`,
      affected: {},
      meta: { bucketMinutes },
    },
    {
      id: `info:week:${input.weekStart}:${input.weekDays.length}`,
      kind: 'info',
      severity: 'low',
      title: 'Week range',
      details: `Week starts ${input.weekStart} with ${input.weekDays.length} day(s).`,
      affected: {},
      meta: { weekStart: input.weekStart, weekDays: input.weekDays },
    },
  ];
};

const sortExplanations = (explanations: Explanation[]) =>
  [...explanations].sort((a, b) => {
    const kindDiff = kindRank[a.kind] - kindRank[b.kind];
    if (kindDiff !== 0) return kindDiff;
    const severityDiff = severityRank[b.severity] - severityRank[a.severity];
    if (severityDiff !== 0) return severityDiff;
    const titleDiff = a.title.localeCompare(b.title);
    if (titleDiff !== 0) return titleDiff;
    return a.id.localeCompare(b.id);
  });

const sortSuggestions = (suggestions: Suggestion[]) =>
  [...suggestions].sort((a, b) => {
    const severityDiff = severityRank['low'] - severityRank['low'];
    if (severityDiff !== 0) return severityDiff;
    return buildSuggestionId(a).localeCompare(buildSuggestionId(b));
  });

export const runSuggestionPipeline = (
  pipelineInput: SuggestionPipelineInput
): SuggestionPipelineOutput => {
  const { input, result } = pipelineInput;
  const violations = result.violations.map(createViolationExplanation);
  const suggestionExplanations = result.suggestions.map(createSuggestionExplanation);
  const info = createInfoExplanations(input);

  return {
    suggestions: sortSuggestions(result.suggestions),
    explanations: sortExplanations([...violations, ...suggestionExplanations, ...info]),
  };
};
