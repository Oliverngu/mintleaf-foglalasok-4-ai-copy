import { normalizeBucketMinutes } from '../engine/timeUtils.js';
import {
  ConstraintViolation,
  EngineInput,
  EngineResult,
  Severity,
  Suggestion,
} from '../engine/types.js';
import { buildViolationAffectedKey } from '../engine/violationUtils.js';
import { buildSuggestionAffected } from './explainability/suggestionAffected.js';
import {
  buildAssistantSuggestionIdV1,
  buildAssistantSuggestionIdV2,
} from './ids/suggestionId.js';
import { Explanation } from './types.js';

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
  id: buildAssistantSuggestionIdV2(suggestion),
  kind: 'suggestion',
  severity: 'low',
  title: suggestion.type,
  details: suggestion.explanation,
  affected: buildSuggestionAffected(suggestion),
  relatedSuggestionId: buildAssistantSuggestionIdV2(suggestion),
  meta: {
    v1SuggestionId: buildAssistantSuggestionIdV1(suggestion),
  },
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
    return buildAssistantSuggestionIdV2(a).localeCompare(buildAssistantSuggestionIdV2(b));
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
